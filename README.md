<p align="center">
<img src="./website/assets/images/banner.webp" alt="Dokapon Kingdom logo" width="520">
</p>


<h1 align="center">
Dokapon Kingdom Tools (DKT)
</h1>

<p align="center">
A collection of tools, calculators, and guides for Dokapon Kingdom and
its different versions.
</p>

<p align="center">
<img src="./website/assets/images/icon.webp" alt="DKT website icon" width="96">
</p>

## Getting started

### Requirements

- Node.js
- npm

### Install dependencies

Clone the repository, open a terminal at its root, then run:

``` sh
npm i
```

## Development

### Run the website locally

For live updates while working on the website, using the **Live Server**
extension in Visual Studio Code is recommended.

### Work with SCSS

This project uses **SCSS (Sass)** for its stylesheets. Regular CSS
syntax is supported, so you do not need advanced Sass knowledge to
contribute.

Start the SCSS watcher with:

``` sh
npm run watch:css
```

The watcher automatically compiles your SCSS changes into CSS.

- Edit the source `.scss` files (the main stylesheet is `style.scss`).
- The theme variables are located in `_themes.scss`, alongside `style.scss`.
- **Do not edit generated CSS files directly.** Make changes in the
    SCSS source files instead.

## Data and image sources

Game-related data and images used by the website are sourced from the
[Dokapon Wiki](https://dokapon.fandom.com/wiki/Dokapon_Wiki).

## Contributing

### Commit messages

Commits must follow the **Conventional Commits** specification. This is
the convention used by Release Please to determine version bumps and
generate the changelog.

Examples:

``` sh
feat: add a new calculator
fix: correct item price calculation
docs: update the README
style: improve website layout
refactor: simplify data processing
```

Use `!` for a breaking change

### Files managed by Release Please

The following files are maintained automatically and **must not be
edited manually**:

- `./changelog.md` : Release Please generates and updates the changelog from commit messages.
- `.release-please-manifest.json` : managed by Release Please.
- `website/version.json` : managed by Release Please.

Please do not make manual changes to these files.

### EditorConfig

Using the **EditorConfig** extension in Visual Studio Code is
recommended, but not required. It helps keep formatting consistent
across editors.

## License

This project is licensed under the [MIT License](./LICENSE).
