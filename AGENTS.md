# AGENTS.md

## Purpose

This repository is an interview-oriented AI Storage tutorial for an engineer with production object-storage experience. Keep the material focused on the intersection of KV cache, GPU data paths, S3/object storage, RDMA, GDS/GPUDirect, and system design.

The primary audience reads Chinese. Keep established technical terms, API names, protocol names, code, commands, and short interview phrases in English where that is clearer.

## Source of truth and scope

Read the surrounding files before editing. In particular:

- `README.md` — repository overview and entry points.
- `_docs/00_Study_Guide.md` — study budget, 30-day plan, JD routing, and stopping rules.
- `_docs/00_Interview_Drills.md` — closed-book interview drills.
- `_docs/01_AI_Storage_KV_Cache.md` — AI workload and KV-cache foundations.
- `_docs/02_GPU_Data_Path.md` — CUDA/RDMA/GPU data movement.
- `_docs/03_System_Design_Interview_Demo.md` — system design and demo contract.
- `_docs/04_CPP_Labs.md` and `examples/cpp-data-path/` — learning labs, not production experience.
- `SOURCES.md` — source/version ledger for fast-changing claims.
- `updates.md` — reader-facing record of meaningful content changes.

Do not broaden this into a generic AI-infrastructure course. Prefer material that helps the reader explain, design, calculate, debug, or demonstrate an AI-storage/data-path problem in an interview.

## Career and evidence boundaries

Preserve these distinctions whenever experience is discussed:

- Production work: Dell ECS/ObjectScale object-storage work, with Java as the main development language for replication/migration/CRR-related functionality; Go telemetry for runtime data collection/statistics; Python used in work.
- Production troubleshooting may rely on logs and storage metadata/state evidence.
- C++, CUDA, RDMA, GDS/GPUDirect, KV-cache systems, and the demo/labs in this repository are learning or transition evidence unless a document explicitly records a real completed experiment.
- Never rewrite new learning as past production ownership.
- Never imply that C++ was the author's production language merely because lower-level product components or current labs use C++.

When a claim is a design proposal, simulation, teaching assumption, local fixture, or unverified hardware path, label it as such.

## Writing style

The repository itself should be the tutorial. Prefer:

1. direct explanation of the concept;
2. one concrete example or calculation;
3. a data-path/sequence/state diagram when useful;
4. trade-offs and failure modes;
5. the depth expected in an interview;
6. concise interview questions/answers or drills.

Avoid turning a chapter into a reading list. External documentation is primarily for evidence, version checks, and deeper follow-up.

Use quantities carefully. Distinguish GB/GiB, Gbps/GB/s, theoretical/effective bandwidth, transfer completion/GPU visibility, and teaching inputs/benchmark results.

## Technical accuracy rules

For fast-changing technologies, verify current official documentation before adding or materially changing claims about versions, feature availability, support matrices, or APIs. Update `SOURCES.md` when the repository's source/version ledger should change.

Do not invent benchmark numbers, product support, or compatibility claims.

Keep these conceptual boundaries explicit:

- S3-compatible APIs do not imply an RDMA data path.
- An S3/object GET is not automatically equivalent to an RDMA READ verb.
- RDMA/GPUDirect can reduce copies or CPU involvement, but control-plane work, registration, completion handling, errors, topology, and lifetime rules still matter.
- GPU-direct transfer completion is not by itself proof that an application-ready KV layout is valid or visible to the consumer.
- GDS, GPUDirect RDMA, cuObject, ordinary S3 clients, and local HTTP fixtures are different mechanisms and must not be conflated.
- Active decode KV, prefill-to-decode handoff, and cold/persistent prefix reuse are different data-path problems.

Prefer mechanisms and decision rules over slogans.

## Jekyll / DocSteer conventions

The site uses Jekyll with the DocSteer theme.

- Collection documents live under `_docs/`.
- New collection pages should include front matter consistent with nearby pages, normally `title`, `category`, and `description`.
- Preserve the configured `/ai-storage-notes` base path. Do not introduce root-absolute links that break GitHub Pages project-site deployment.
- For rendered-site links inside collection documents, follow nearby usage of `{{ site.baseurl }}` where appropriate.
- Keep repository-facing links in `README.md` usable on GitHub.
- Do not add hand-written “previous / next / contents” navigation to article bodies. DocSteer owns page navigation; `_includes/doc-footer.html` contains the repository-specific pager override.
- Preserve `docsteer.edit_page.path: ""` unless the collection layout changes. Collection page paths already contain `_docs/`.
- Do not re-enable the DocSteer credit in the footer unless explicitly requested.
- Avoid theme/config changes when a content-only change is sufficient.

When adding, removing, or renaming a page, inspect the surrounding navigation/index/search data and update only the files that actually need to stay consistent.

## Updates policy

Use `updates.md` for meaningful reader-visible changes such as a new chapter, a substantial rewrite, a new lab, or an important correctness fix.

Do not add an update entry for every typo, wording cleanup, link repair, or tiny code edit. The update list should remain useful rather than becoming a commit log.

## Validation

For documentation changes, run at least:

```bash
bundle exec jekyll build --baseurl /ai-storage-notes
python3 scripts/check_site_links.py _site /ai-storage-notes
```

For changes under `examples/cpp-data-path/`, also run:

```bash
cmake -S examples/cpp-data-path -B build/cpp-labs -DCMAKE_BUILD_TYPE=Debug
cmake --build build/cpp-labs --parallel 2
ctest --test-dir build/cpp-labs --output-on-failure
```

These C++ tests validate CPU/local HTTP contracts only unless the test itself explicitly proves otherwise. Do not describe them as S3, GPU, RDMA, or production integration tests.

If a check cannot be run, say exactly which check was not run and do not claim success.

## Change discipline

- Make the smallest coherent change that satisfies the request.
- Do not rewrite unrelated chapters for style while doing a focused task.
- Preserve deliberate terminology and evidence boundaries unless there is a correctness reason to change them.
- Before changing a repeated number, schedule, chapter count, benchmark assumption, or career statement, search for other occurrences and keep them consistent.
- Never delete caveats merely to make the text sound stronger.
