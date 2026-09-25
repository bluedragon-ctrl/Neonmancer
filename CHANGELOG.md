# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Project scaffolding: Vite, placeholder title screen, unit tests with
  `node --test`, GitHub Actions CI (test + build), GitHub Pages deploy of
  `main`, PR template, docs skeleton.
- Fixed-timestep game loop (60 logic updates per second, interpolation
  alpha for rendering, capped catch-up).
- Action-mapped keyboard input with default bindings; taps shorter than a
  tick are never lost.
- Temporary on-screen readout of TPS, FPS, buffer size and active actions.
- Isometric neon renderer: letterboxed 16:9 stage, capped pixel ratio and
  render scale (`?scale=0.5`), fixed isometric camera, thick neon edges
  scaled with render height, bloom, amber room grid on a fading dark-gray
  infinite floor grid, back walls and dark occluding block faces.
- Game data in `data/` (rooms, object types, biomes, world) with JSON
  Schemas in `schemas/`; Ajv check in the dev server, the build and
  `npm run validate:data` (CI); semantic checks at load time; the start
  room is built from JSON; error screen listing every data problem.
- First room "Boot Sector" with two crates (not pushable yet).
- Object type styles (dashed edges, face marks, tinted faces) so types
  differ by shape, not only color; box variants as named types in
  `defs.json`, shown side by side in Boot Sector.
- Floor holes in room data (`holes`): drawn as black pits on a faintly
  tinted room floor, validated (inside the room, nothing standing in them,
  spawn not above one). Fillable in the next step.
- The wizard: cone body, ball head, floating hands and a tilted pointy hat
  in neon lines; walks along the grid axes, jumps exactly one block high
  (with coyote time and a jump buffer), falls with gravity and collides
  with blocks, objects and the room sides. Motion is interpolated between
  logic ticks; a glowing drop shadow shows where he will land.
- Falling into a hole: the wizard drops into the pit and respawns at the
  room spawn.
- Asset showcase (`/tools/showcase.html`): every character and object look
  on a turntable, also on the deployed site.
