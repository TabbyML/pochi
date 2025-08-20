# Pochi Documentation

Official documentation website for Pochi, built from Fumadocs.

## Getting Started

```bash
# Install dependencies (from repo root)
bun install

# Start development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start
```

Open http://localhost:3000 to view the documentation site.

## Project Structure

```
packages/docs/
├── content/docs/       # MDX documentation files
├── public/images/      # Documentation images and assets
├── src/
│   ├── app/           # Next.js app router pages
│   ├── components/    # React components
│   └── lib/           # Utilities and configuration
├── source.config.ts   # MDX configuration
└── postcss.config.mjs # PostCSS/Tailwind configuration
```

## Adding Documentation

1. **Create new docs**: Add MDX files in `content/docs/`
2. **Update navigation**: Modify `content/docs/meta.json`
3. **Add images**: Place assets in `public/images/`
4. **Preview changes**: Run `bun run dev` to see live updates

## Key Routes

| Route | Description |
|-------|-------------|
| `/` | Homepage |
| `/docs` | Documentation layout and pages |
| `/api/search` | Search functionality |

## Technologies

- **Next.js 15** - React framework
- **Documentation framework** - Built-in search and navigation
- **MDX** - Markdown with React components
- **Tailwind CSS** - Utility-first CSS framework

## Development Notes

- This package is part of the Pochi monorepo
- Uses workspace catalog for shared dependencies (`react`, `tailwindcss`)
- Ignored by Biome linting (configured in root `biome.json`)
- Build dependencies are excluded from unused dependency checks

Built from the Fumadocs documentation framework.