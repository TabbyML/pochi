import type { Meta, StoryObj } from "@storybook/react";
import { MessageMarkdown } from "../markdown";

const meta: Meta<typeof MessageMarkdown> = {
  title: "Pochi/Mermaid",
  component: MessageMarkdown,
  parameters: {
    layout: "padded",
  },
  argTypes: {
    children: {
      control: "text",
      description: "Markdown content with mermaid diagrams to render",
    },
    className: {
      control: "text",
      description: "Additional CSS classes",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Flowchart: Story = {
  args: {
    children: `# Mermaid Flowchart Example

## Simple Flowchart
\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Fix it]
    D --> B
\`\`\`

## Complex Flowchart
\`\`\`mermaid
graph LR
    A[Hard edge] -->|Link text| B(Round edge)
    B --> C{Decision}
    C -->|One| D[Result one]
    C -->|Two| E[Result two]
    C -->|Three| F[Result three]
\`\`\`
`,
  },
};

export const SequenceDiagram: Story = {
  args: {
    children: `# Mermaid Sequence Diagram Example

## Basic Sequence Diagram
\`\`\`mermaid
sequenceDiagram
    participant User
    participant Pochi
    User->>Pochi: Request help
    Pochi->>User: Provide assistance
    User->>Pochi: Thank you!
\`\`\`

## Complex Sequence Diagram
\`\`\`mermaid
sequenceDiagram
    participant A as Alice
    participant B as Bob
    participant C as Charlie
    A->>B: Hello Bob, how are you?
    B->>C: How about you Charlie?
    C->>B: All good thanks!
    B->>A: I'm good thanks!
\`\`\`
`,
  },
};

export const ClassDiagram: Story = {
  args: {
    children: `# Mermaid Class Diagram Example

## Simple Class Diagram
\`\`\`mermaid
classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal: +int age
    Animal: +String gender
    Animal: +isMammal()
    Animal: +mate()
    class Duck{
        +String beakColor
        +swim()
        +quack()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }
\`\`\`
`,
  },
};

export const StateDiagram: Story = {
  args: {
    children: `# Mermaid State Diagram Example

## Simple State Diagram
\`\`\`mermaid
stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
\`\`\`
`,
  },
};

export const GanttChart: Story = {
  args: {
    children: `# Mermaid Gantt Chart Example

## Simple Gantt Chart
\`\`\`mermaid
gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :after a1  , 20d
    section Another
    Task in sec      :2014-01-12  , 12d
    another task      : 24d
\`\`\`
`,
  },
};

export const PieChart: Story = {
  args: {
    children: `# Mermaid Pie Chart Example

## Simple Pie Chart
\`\`\`mermaid
pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15
\`\`\`
`,
  },
};
