# Guide for Writing Design Markdown Files

## Purpose

This guide defines how Runway agents should write design documentation in Markdown for product, UX, visual direction, and design systems.

The goal is not to generate vague design poetry. The goal is to produce Markdown files that are:

- structured
- reusable
- implementation-aware
- visually opinionated when needed
- useful for designers, developers, and AI coding agents

These Markdown files should help transform design intent into consistent execution.

## Core principle

Always separate these layers clearly:

1. Product / Context
2. UX Rules
3. Visual Rules
4. Design Tokens / Design System
5. Components
6. Screen Briefs
7. Implementation Mapping

Do not merge everything into one oversized file unless explicitly requested.

When in doubt:

- strategy belongs in `product-context.md`
- behavior belongs in `ux-rules.md`
- aesthetics belong in `visual-rules.md`
- reusable rules belong in `design-system.md`
- anatomy and states belong in `components.md`
- task-specific needs belong in `screen-brief-*.md`

## Output standards

Every Markdown file written by the agent must be:

- easy to scan
- organized with clean heading hierarchy
- explicit rather than vague
- grounded in usage
- consistent in naming
- written in practical language

Avoid empty creative writing that sounds premium but does not help implementation.

Bad:

- "This interface should feel like a dream suspended in silence."

Better:

- "Use large whitespace, restrained contrast, and asymmetrical image placement to create a quiet editorial atmosphere."

The writing should have taste, but also operational value.

## File types

### product-context.md

Purpose:
- define what the product is, who it is for, and what the experience must optimize for

Should include:
- product summary
- business goal
- user types
- user needs
- primary use cases
- success principles
- product tone
- platform context

Should not include:
- full component specs
- raw token tables
- detailed state logic

### ux-rules.md

Purpose:
- define interaction logic, information hierarchy, content clarity, and behavioral rules

Should include:
- Experience Goals
- Interaction Principles
- Hierarchy Rules
- Navigation Rules
- Form Rules
- Empty States
- Error States
- Content and Microcopy
- Accessibility
- Responsive Behavior

UX-rules structure should explain:

- what the experience should help users do well
- how to reduce cognitive load
- how to reveal complexity progressively
- how to prioritize action clarity
- how to preserve orientation
- what should appear first, second, and last
- how users should move through the product
- how forms should handle grouping, defaults, validation, and recovery
- how empty states should inform and guide users
- how error states should support recovery and what language to use
- how tone, labels, CTAs, and status language should behave
- how keyboard access, contrast, focus, touch targets, and non-color meaning should be handled
- how information priority should shift across screen sizes

Should not include:
- color palette details
- decorative visual philosophy unless it affects usability
- low-level token values unless essential

### visual-rules.md

Purpose:
- define the visual personality, art direction, tonal behavior, typography mood, spatial feel, and composition style

Should include:
- Creative North Star
- Visual Character
- Layout Style
- Color Philosophy
- Typography Voice
- Surface and Elevation
- Component Styling Principles
- Do's and Don'ts

Visual-rules structure should explain:

- the emotional and visual ambition of the product
- dominant qualities such as editorial, restrained, bold, soft, architectural, playful, premium, or technical
- symmetry vs asymmetry
- density
- whitespace behavior
- alignment style
- image placement logic
- what color is for
- what color is not for
- whether emphasis comes from contrast, tonal depth, or accent color
- the role of display type
- the role of body type
- hierarchy style
- caption and metadata behavior
- how borders, shadows, tonal separation, overlays, and blur should be used
- how the visual system changes buttons, cards, inputs, media, and navigation
- strong guardrail rules that preserve identity

Recommended structure:

```md
# Visual Rules: [System Name]

## Creative North Star
[Describe the defining emotional and aesthetic direction.]

## Visual Character
- [keyword]
- [keyword]
- [keyword]

## Composition Principles
- [rule]
- [rule]
- [rule]

## Color Philosophy
[Explain how color should behave.]

## Surface Behavior
[Explain backgrounds, boundaries, tonal shifts, and borders.]

## Typography Voice
[Explain display, body, captions, and hierarchy tone.]

## Depth and Atmosphere
[Explain shadows, blur, overlays, and layering.]

## Media and Imagery
[Explain crop, ratio, placement, radius, hover behavior.]

## Component Styling
[Summarize how major components should feel.]

## Do's and Don'ts
### Do
- [rule]
- [rule]

### Don't
- [rule]
- [rule]
```

Should not include:
- large token tables
- every component state
- implementation-specific code syntax unless requested

This file may be expressive, but must still remain actionable.

### design-system.md

Purpose:
- define the reusable design system foundation

Should include:
- token categories
- naming rules
- color roles
- typography scale
- spacing scale
- radius scale
- border rules
- shadow rules
- grid/layout rules
- responsive logic
- accessibility minimums
- usage constraints

Should not include:
- poetic brand storytelling without operational value
- screen-specific content
- one-off exceptions unless they are systemized

Recommended structure:

```md
# Design System

## Foundations
### Color
### Typography
### Spacing
### Radius
### Borders
### Shadows
### Motion

## Layout
### Grid
### Containers
### Breakpoints

## Accessibility
### Contrast
### Focus
### Touch Targets
### Non-Color Meaning

## Tokens
[Define naming and examples.]

## Usage Rules
[Explain reuse and constraints.]
```

### components.md

Purpose:
- define reusable UI components and how they behave

Should include for each component:
- purpose
- anatomy
- variants
- sizes
- states
- content rules
- interaction rules
- usage rules
- accessibility notes
- responsive behavior
- related components
- implementation notes if needed

Suggested components:
- button
- input
- textarea
- select
- tabs
- card
- modal
- drawer
- dropdown
- tooltip
- badge
- toast
- table
- list item
- empty state
- pagination
- chip
- navbar
- side panel

Recommended top-level structure:

```md
# Components

## Button
## Input
## Card
## Modal
## Tabs
## List Item
## Empty State
```

For each component define:

- purpose
- anatomy
- variants
- sizes
- states
- content rules
- usage rules
- accessibility
- responsive behavior

Example component entry:

```md
## Component: Button

### Purpose
Used for initiating key actions.

### Anatomy
- container
- label
- leading icon
- trailing icon
- loading indicator

### Variants
- primary
- secondary
- tertiary
- destructive

### Sizes
- sm
- md
- lg

### States
- default
- hover
- focus
- active
- disabled
- loading

### Content Rules
- labels should start with a verb when possible
- avoid vague text such as "Continue" unless context is obvious

### Usage Rules
- use one primary button per section
- avoid stacking multiple primary buttons together

### Accessibility
- visible focus state required
- minimum touch target size applies

### Responsive Behavior
- full-width on narrow mobile layouts if action priority is high
```

### screen-brief-*.md

Purpose:
- define one screen clearly enough for design or build

Should include:
- screen name
- screen goal
- primary user task
- hierarchy
- sections
- main CTA
- secondary CTA
- component list
- constraints
- edge cases
- empty/error/loading states
- success criteria

Should not include:
- full design system duplication
- unrelated product background

Recommended structure:

```md
# Screen Brief: [Screen Name]

## Goal
What should the screen help the user do?

## Primary User
Who is this screen primarily for?

## Primary Task
What is the main thing the user should accomplish here?

## Hierarchy
1. most important information
2. supporting information
3. secondary actions
4. tertiary detail

## Sections
- section 1
- section 2
- section 3

## Primary Action
[Main CTA]

## Secondary Actions
- [Action]
- [Action]

## Components Needed
- [Component]
- [Component]
- [Component]

## States
- default
- empty
- loading
- error
- success

## Constraints
- mobile-first
- avoid dense layouts
- protect first-screen scanability

## Success Criteria
- user understands the page within a few seconds
- main action is obvious
- supporting detail does not compete with the main task
```

### implementation-mapping.md

Purpose:
- map design language into code and tooling

Should include:
- Figma naming to code naming
- token mapping
- shadcn usage
- Radix usage
- custom component ownership
- CSS variable mapping
- design-to-code constraints
- responsive breakpoints
- code conventions if relevant

## Writing mode by file type

- `product-context.md`: strategic, clear, product-oriented
- `ux-rules.md`: behavioral, practical, user-centered
- `visual-rules.md`: expressive but disciplined art direction
- `design-system.md`: structured, system-level, operational
- `components.md`: precise, spec-like
- `screen-brief-*.md`: tactical and execution-focused

## Concept-to-rule balance

When writing visual or brand-influenced Markdown, target:

- 30% concept
- 70% usable rules

Never stop at metaphor alone.

## Required quality checks

Before finalizing a design Markdown file, verify:

Structural check:
- Does the file match its intended type?
- Are sections grouped logically?
- Are headings clean and non-redundant?

Clarity check:
- Can a designer use this?
- Can a developer interpret this?
- Can an AI coding agent follow this without guessing too much?

Practicality check:
- Does it include enough rules to be reused?
- Does it avoid vague decorative language?
- Does it distinguish principles from implementation?

Completeness check:
- Are critical states covered?
- Are constraints included?
- Are major omissions avoided?

## Writing rules

Do:
- write with clear hierarchy
- define purpose before detail
- use named principles
- explain why when a rule is opinionated
- include examples when helpful
- make rules reusable
- distinguish global rules from one-off rules
- keep terminology consistent

Do not:
- mix UX logic and visual styling carelessly
- invent token names without a system
- write abstract design language with no practical application
- describe everything as "modern" or "clean" without specifics
- omit states, accessibility, or responsive behavior in system docs
- duplicate the same rule in multiple files unless necessary

## Token writing rules

When writing token-related docs, always define:

- token category
- purpose
- naming logic
- example values
- usage rules

Recommended categories:

- color
- typography
- spacing
- radius
- border
- shadow
- opacity
- blur
- motion
- z-index

Example structure:

```md
## Color Tokens

### Purpose
Color tokens define semantic and structural color usage across the product.

### Categories
- brand
- surface
- text
- border
- state
- data-vis

### Naming Pattern
[color-role]-[level]

### Example Tokens
- surface-default
- surface-subtle
- text-primary
- text-secondary
- border-muted
- action-primary
- status-error
```
