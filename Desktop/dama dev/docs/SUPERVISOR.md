# Supervisor Chief

The Supervisor Chief (`supervisor.py`) is the governing loop of the data farm. It ensures sequential GPU usage, protects human work, and manages hardware safety.

## Governing Principles

1. **Human Work Immunity**: Any job marked with `is_manual = 1` is skipped. The AI never overwrites human-validated "Golden Records."
2. **Cold Stop Thermal Guard**:
   - Stop Threshold: 75°C
   - Resume Threshold: 55°C
   - This prevents thermal wear and the "restart loop" during unsupervised runs.
3. **Sequential GPU Hand-off**: Only one of the following workers runs at a time:
   - `transcription`
   - `keys`
   - `generation`
   - `translation`
   - `dubbing`
4. **Resilient Retry**: Failed jobs are assigned a `retry_after` timestamp (10-minute backoff) rather than jamming the pipeline.

## Operation

```bash
# Start the farm
python -m scripts/pipeline.streaming.supervisor

# Monitor via dashboard
python -m scripts/pipeline.streaming.dashboard
```

## Telemetry

All runs are logged to the `job_telemetry` table, tracking RAM, VRAM, and tokens used.
