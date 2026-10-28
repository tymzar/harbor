# Technical report

`main.pdf` is the submission's technical report. Tables come from the evaluation data, not typed by hand:

```bash
node report/tables.ts                       # evaluation/runs/* + scenarios.json → report/generated/*.tex
cd report && latexmk -pdf main.tex          # → main.pdf
```

Figures are from the owned test pages (`evidence/day3-effort-low/`); no third-party site appears in the report.
