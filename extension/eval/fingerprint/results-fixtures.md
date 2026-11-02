Fixtures: 3; groups: 9; seeds: 3

| Change | Groups | Baseline correct | Baseline wrong | Baseline none | Region correct | Region wrong | Region none | Region ungated wrong | Skeleton changed | Structure changed |
|---|---|---|---|---|---|---|---|---|---|---|
| none | 27 | 100% | 0% | 0% | 100% | 0% | 0% | 0% | 0% | 0% |
| class-hash | 27 | 100% | 0% | 0% | 100% | 0% | 0% | 0% | 0% | 0% |
| id-churn | 27 | 100% | 0% | 0% | 100% | 0% | 0% | 0% | 0% | 0% |
| wrapper | 27 | 85% | 0% | 15% | 100% | 0% | 0% | 0% | 0% | 33% |
| insert | 27 | 93% | 0% | 7% | 89% | 0% | 11% | 11% | 33% | 100% |
| reorder | 27 | 85% | 0% | 15% | 81% | 4% | 15% | 4% | 33% | 33% |
| text-counters | 27 | 89% | 0% | 11% | 100% | 0% | 0% | 0% | 0% | 0% |
| text-copy | 27 | 22% | 0% | 78% | 89% | 0% | 11% | 0% | 67% | 0% |
| text-translate | 27 | 11% | 0% | 89% | 89% | 0% | 11% | 0% | 67% | 0% |
| viewport | 27 | 100% | 0% | 0% | 100% | 0% | 0% | 11% | 0% | 0% |
| list-grow | 27 | 93% | 0% | 7% | 100% | 0% | 0% | 4% | 33% | 0% |
| list-shrink | 27 | 85% | 0% | 15% | 100% | 0% | 0% | 11% | 22% | 0% |
| redesign | 27 | 100% | 0% | 0% | 100% | 0% | 0% | 22% | 100% | 100% |
| ab-variant | 27 | 33% | 0% | 67% | 70% | 0% | 30% | 11% | 56% | 100% |
| all | 378 | 78% | 0% | 22% | 94% | 0% | 6% | 5% | 29% | 26% |
Totals over 351 changed groups: baseline 269 correct / 0 wrong / 82 none; region 329 correct / 1 wrong / 21 none

| Band | Groups | Correct | Wrong (if applied) |
|---|---|---|---|
| same | 226 | 100% | 0% |
| moved | 101 | 99% | 1% |
| skipped | 35 | 46% | 54% |
| lost | 16 | 81% | 0% |
| dropped | 0 | – | – |

Groups whose region was gone: 30; applied anyway (wrong): baseline 0, region 0
