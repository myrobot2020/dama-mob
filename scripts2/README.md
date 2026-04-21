# scripts2 (one-layer)

Primary entrypoint:

- `pipeline.py`

Core support:

- `config.py`
- `14_tally.py`
- helper modules used by pipeline stages

Run all stages:

- `python pipeline.py`

Run one stage only:

- `python pipeline.py --from-stage segmentation --to-stage segmentation`
