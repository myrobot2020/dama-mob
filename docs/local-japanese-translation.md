# Local Japanese Translation

Goal: translate existing English sutta/commentary transcripts to Japanese without paid APIs.

The prepared local pipeline writes generated Japanese records under:

```text
data/translations/ja/
```

Recommended first pass:

```powershell
python scripts2/16_translate_ja.py --engine nllb --sutta-id an1.48 --limit 1
```

For a dry run that checks file selection and output shape without a model:

```powershell
python scripts2/16_translate_ja.py --engine echo --sutta-id 1.48 --limit 1 --dry-run
```

Check local translator dependencies:

```powershell
python scripts2/16_translate_ja.py --check
```

## Engines

- `echo`: no translation, useful for verifying paths and JSON shape.
- `nllb`: local Hugging Face translation using `facebook/nllb-200-distilled-600M`.

`nllb` needs local Python packages:

```powershell
python -m pip install torch transformers sentencepiece
```

The first model run downloads the model once. After that, use:

```powershell
python scripts2/16_translate_ja.py --engine nllb --offline --sutta-id an1.48
```

## Output Shape

Each output file mirrors the validated corpus path:

```text
data/validated-json/an/an1/1.48.json
data/translations/ja/an/an1/1.48.ja.json
```

The generated file contains:

- source path
- engine/model metadata
- English source fields
- Japanese translated fields
- glossary terms used for later review

The glossary lives at:

```text
data/glossaries/en-ja.tsv
```
