import type { Meta, StoryObj } from "@storybook/react";
import { MessageMarkdown } from "../markdown";

const meta: Meta<typeof MessageMarkdown> = {
  title: "Message/Markdown",
  component: MessageMarkdown,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    children: {
      control: "text",
      description: "Markdown content to render",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Comprehensive: Story = {
  args: {
    children: `# Markdown Component Showcase

This comprehensive example demonstrates all the features of the MessageMarkdown component.

## Basic Text Formatting

This is a paragraph with **bold text**, *italic text*, and \`inline code\`. You can also combine them like ***bold and italic*** text.

### Lists and Organization

#### Unordered Lists
- Item 1
- Item 2 with **bold text**
- Item 3 with *italic text*
  - Nested item A
  - Nested item B

#### Ordered Lists
1. First item
2. Second item with \`inline code\`
3. Third item
   1. Nested numbered item
   2. Another nested item

#### Task Lists (GitHub Flavored Markdown)
- [x] Completed task
- [ ] Incomplete task
- [x] Another completed task with **bold text**

## Code Examples

### JavaScript
\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));

// Fibonacci function
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
\`\`\`

### TypeScript
\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  id: 1,
  name: "John Doe",
  email: "john@example.com"
};

function processUser(user: User): string {
  return \`Processing user: \${user.name} (\${user.email})\`;
}
\`\`\`

### Python
\`\`\`python
def hello_world():
    print("Hello, World!")

class Calculator:
    def __init__(self):
        self.history = []
    
    def add(self, a, b):
        result = a + b
        self.history.append(f"{a} + {b} = {result}")
        return result
\`\`\`

## File References

You can reference files using custom tags that render as clickable file badges:

<file>src/components/button.tsx</file>
<file>package.json</file>
<file>README.md</file>
<file>src/hooks/use-search.ts</file>

These file badges are interactive and will open the file in the editor when clicked.

## GitHub Flavored Markdown Features

### Tables
| Feature | Supported | Notes |
|---------|-----------|-------|
| Tables | ✅ | Full GFM support |
| Strikethrough | ✅ | ~~crossed out~~ |
| Task lists | ✅ | See above |
| File badges | ✅ | Custom implementation |

### Strikethrough Text
~~This text is crossed out~~ but this text is normal.

## Links and Blockquotes

[Visit GitHub](https://github.com) for more information.

> This is a blockquote with some important information.
> 
> It can span multiple lines and contain **bold text** and *italic text*.
> 
> > Nested blockquotes are also supported.

## Streaming Response with Cursor

This demonstrates the streaming cursor functionality: \`▍\`

You can also have the cursor in code blocks:

\`\`\`javascript
function example() {
  console.log("typing...")▍
}
\`\`\`

## Math Expressions (if supported)

Inline math: $E = mc^2$

Block math:
$$
\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n
$$

## Horizontal Rules

---

## Complex Example

Here's a more complex example combining multiple features:

### Search Component Implementation

<file>src/components/search-component.tsx</file>

\`\`\`typescript
import React, { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';

interface SearchProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  delay?: number;
}

export const SearchComponent: React.FC<SearchProps> = ({
  onSearch,
  placeholder = "Search...",
  delay = 300
}) => {
  const [query, setQuery] = useState('');
  
  const debouncedSearch = useCallback(
    debounce((searchQuery: string) => {
      onSearch(searchQuery);
    }, delay),
    [onSearch, delay]
  );
  
  useEffect(() => {
    debouncedSearch(query);
    return () => {
      debouncedSearch.cancel();
    };
  }, [query, debouncedSearch]);
  
  return (
    <input
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={placeholder}
      className="search-input"
    />
  );
};
\`\`\`

#### Features Checklist
- [x] **Debounced Search**: Prevents excessive API calls
- [x] **TypeScript Support**: Full type safety
- [x] **Customizable Delay**: Configurable debounce timing
- [x] **Clean Cleanup**: Proper effect cleanup

#### Related Files
<file>src/hooks/use-debounce.ts</file>
<file>src/utils/search-utils.ts</file>
<file>tests/search-component.test.tsx</file>

> **Note**: This component provides a robust search experience with proper performance optimizations and TypeScript support.

---

This concludes the comprehensive markdown showcase demonstrating all supported features including basic formatting, code blocks, file references, tables, task lists, and streaming cursors.`,
  },
};
