from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass


DEFAULT_GPU_TEMP_LIMIT_C = 78
DEFAULT_CPU_TEMP_LIMIT_C = 85


class ResourceGuardPaused(RuntimeError):
    """Raised when a worker should pause without marking the job failed."""


@dataclass(frozen=True)
class ThermalSnapshot:
    gpu_temp_c: int | None
    cpu_temp_c: int | None


def env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def read_gpu_temp_c() -> int | None:
    nvidia_smi = shutil.which("nvidia-smi")
    if not nvidia_smi:
        return None
    result = subprocess.run(
        [nvidia_smi, "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
        check=False,
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode != 0:
        return None
    temps = []
    for line in result.stdout.splitlines():
      stripped = line.strip()
      if stripped.isdigit():
          temps.append(int(stripped))
    return max(temps) if temps else None


def read_cpu_temp_c() -> int | None:
    # Windows exposes this inconsistently. Treat it as best-effort only.
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        return None
    command = (
        "Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi "
        "| Select-Object -First 1 -ExpandProperty CurrentTemperature"
    )
    result = subprocess.run(
        [powershell, "-NoProfile", "-Command", command],
        check=False,
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode != 0:
        return None
    raw = result.stdout.strip().splitlines()
    if not raw:
        return None
    try:
        kelvin_tenths = float(raw[0])
    except ValueError:
        return None
    celsius = round((kelvin_tenths / 10) - 273.15)
    if celsius < 0 or celsius > 130:
        return None
    return int(celsius)


def thermal_snapshot() -> ThermalSnapshot:
    return ThermalSnapshot(gpu_temp_c=read_gpu_temp_c(), cpu_temp_c=read_cpu_temp_c())


def assert_thermal_room(worker_type: str, *, snapshot: ThermalSnapshot | None = None) -> ThermalSnapshot:
    snap = snapshot or thermal_snapshot()
    gpu_limit = env_int("DAMA_MAX_GPU_TEMP_C", DEFAULT_GPU_TEMP_LIMIT_C)
    cpu_limit = env_int("DAMA_MAX_CPU_TEMP_C", DEFAULT_CPU_TEMP_LIMIT_C)

    if snap.gpu_temp_c is not None and snap.gpu_temp_c >= gpu_limit:
        raise ResourceGuardPaused(
            f"{worker_type} paused: GPU is {snap.gpu_temp_c}C, limit is {gpu_limit}C"
        )
    if snap.cpu_temp_c is not None and snap.cpu_temp_c >= cpu_limit:
        raise ResourceGuardPaused(
            f"{worker_type} paused: CPU is {snap.cpu_temp_c}C, limit is {cpu_limit}C"
        )
    return snap
