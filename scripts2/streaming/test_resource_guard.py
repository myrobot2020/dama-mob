from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest

from scripts2.streaming.resource_guard import ResourceGuardPaused, ThermalSnapshot, assert_thermal_room


def test_resource_guard_allows_cool_snapshot(monkeypatch):
    monkeypatch.setenv("DAMA_MAX_GPU_TEMP_C", "78")
    monkeypatch.setenv("DAMA_MAX_CPU_TEMP_C", "85")

    snap = assert_thermal_room("panel_extraction", snapshot=ThermalSnapshot(gpu_temp_c=55, cpu_temp_c=60))

    assert snap.gpu_temp_c == 55


def test_resource_guard_pauses_hot_gpu(monkeypatch):
    monkeypatch.setenv("DAMA_MAX_GPU_TEMP_C", "70")

    with pytest.raises(ResourceGuardPaused, match="GPU is 71C"):
        assert_thermal_room("panel_extraction", snapshot=ThermalSnapshot(gpu_temp_c=71, cpu_temp_c=None))


def test_resource_guard_pauses_hot_cpu(monkeypatch):
    monkeypatch.setenv("DAMA_MAX_CPU_TEMP_C", "80")

    with pytest.raises(ResourceGuardPaused, match="CPU is 81C"):
        assert_thermal_room("segmentation", snapshot=ThermalSnapshot(gpu_temp_c=None, cpu_temp_c=81))
