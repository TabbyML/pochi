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

### Creating New Documentation

All documentation files are located in `content/docs/`. To add new documentation:

1. **Create MDX files**: Add new `.mdx` files in `content/docs/` directory
   ```bash
   # Example: Add a new guide
   touch content/docs/my-new-guide.mdx
   ```

2. **File structure**: Each MDX file supports frontmatter for metadata
   ```mdx
   ---
   title: "My New Guide"
   description: "A comprehensive guide about..."
   ---
   
   # My New Guide
   
   Your content here...
   ```

3. **Update navigation**: Modify `content/docs/meta.json` to add your new page to the sidebar
   ```json
   {
     "title": "Documentation",
     "pages": [
       "index",
       "installation", 
       "my-new-guide"
     ]
   }
   ```

4. **Add images**: Place any images in `public/images/` and reference them:
   ```mdx
   ![Alt text](/images/my-image.png)
   ```

5. **Preview changes**: Run `bun run dev` to see live updates at http://localhost:3000

### File Organization

- Use kebab-case for file names: `my-new-guide.mdx`
- Group related docs in subdirectories if needed
- Keep images organized in `public/images/` with descriptive folder names
- Update `meta.json` files to maintain proper navigation structure

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