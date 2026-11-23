---
"@barqjs/core": minor
---

`create-barq` does the whole job. It asks for (or takes a flag for) the template, add-ons, package manager, install and git, then installs, writes the generated files and makes the first commit. `--yes` takes every default, and `--list-templates --json` and `--list-add-ons --json` answer a tool.

Templates come from the `templates` branch on GitHub, so a template fix needs no release. `--offline` and a run without network use the copy the package ships.

The `ui` add-on sets up `barq-ui`, adds a starter set of components and imports the theme.
