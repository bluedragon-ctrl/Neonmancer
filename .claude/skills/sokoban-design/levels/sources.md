# Classic Sokoban collections

Classic layouts may be used as they are or adapted, with the author
credited in the room's decision (D197). A collection kept here is an
`.xsb` file with a header comment: collection, author, source URL, date
fetched. `solve.mjs` and `xsb.mjs` read it with `--level N` (levels are
counted from 1 in file order).

Good fits are small levels (rooms are mostly 8×8 to 12×12, x + z <= 32)
with few crates (the solver and the player both like 2–4).

| Collection | Author | Levels | Where | Notes |
|---|---|---|---|---|
| Microban | David W. Skinner | 155 | http://www.sneezingtiger.com/sokoban/levels/microbanText.html | Here as `microban.xsb`, reviewed in `microban-survey.md`. Small, one idea each: the best fit |
| His other sets (later Microbans, Sasquatch) | David W. Skinner | many | http://www.sneezingtiger.com/sokoban/levels.html | Not fetched yet; Sasquatch levels are mostly too big |

More collections: the Sokoban wiki (sokobano.de) and letslogic.com.
Levels in RLE form (digits as counts) must be expanded before
`xsb.mjs` reads them.
