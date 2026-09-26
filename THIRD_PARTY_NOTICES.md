# Third-party notices

The web app (`src/web`) includes or adapts code from the projects below. Each is used under its own licence; the portal itself is MIT.

## Radix Themes and Radix Primitives

- Packages: `@radix-ui/themes`, `radix-ui` (npm dependencies, not vendored)
- Copyright (c) 2022 WorkOS
- Licence: MIT, https://github.com/radix-ui/themes/blob/main/LICENSE and https://github.com/radix-ui/primitives/blob/main/LICENSE

## Amicro (micro-transitions)

- Source: https://github.com/Subhan-code/Amicro--Micro-transitions-
- Copyright (c) 2026 Syed Subhan Uddin
- Licence: MIT
- Adapted into `src/web/components/amicro/` (fade-up, text-reveal, magnetic, tilt-card, use-web-haptics, motion presets). Each file starts with an attribution comment. The `@subhanhq/amicro` npm package is not used.

MIT License text (Amicro):

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Magic UI (inspiration)

- Source: https://magicui.design, https://github.com/magicuidesign/magicui
- Licence: MIT
- `src/web/components/magic/` (magic card, number ticker, progress ring, animated list, rank shift, confetti helper) was written after Magic UI's component ideas; no files are copied verbatim.
