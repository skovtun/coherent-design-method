# Contributing to Coherent Design Method

Thank you for your interest in contributing to Coherent Design Method! This document provides guidelines for contributing to the methodology documentation and examples.

---

## How Can I Contribute?

### 1. Documentation Improvements

Help make the methodology clearer and more accessible:

- **Fix typos and grammar** — Even small corrections help
- **Clarify concepts** — If something is confusing, suggest improvements
- **Add examples** — Real-world examples make concepts tangible
- **Translate** — Help make the method accessible in other languages

### 2. Case Studies & Examples

Share how you've applied the method:

- **Success stories** — What worked well?
- **Lessons learned** — What didn't work?
- **Industry-specific applications** — How does it apply to your field?
- **Before/after comparisons** — Show the impact

### 3. Conceptual Contributions

Suggest enhancements to the methodology:

- **New principles** — Additional core principles
- **Pattern catalog** — Reusable patterns you've discovered
- **Anti-patterns** — Common mistakes to avoid
- **Tools and techniques** — Supporting tools and practices

### 4. Issue Reports

Found something unclear or incorrect?

- **Unclear explanations** — Point out confusing sections
- **Outdated information** — Let us know what needs updating
- **Missing information** — Suggest topics we should cover
- **Broken links** — Report any broken references

---

## Contribution Process

### For Small Changes (Typos, Grammar, Links)

1. **Fork the repository**
2. **Make your changes** in a new branch
3. **Submit a pull request** with a clear description

Example:
```bash
git checkout -b fix/typo-in-principles
# Make your changes
git commit -m "docs: fix typo in principles.md"
git push origin fix/typo-in-principles
# Open PR on GitHub
```

### For Larger Changes (New Content, Examples)

1. **Open an issue first** to discuss the proposed changes
2. **Wait for feedback** before investing significant time
3. **Follow the discussion** and refine your proposal
4. **Submit a PR** once the approach is agreed upon

Example:
```markdown
# Issue Template for New Content

## What are you proposing?
Add a case study on applying Coherent Design Method to e-commerce applications.

## Why is this valuable?
E-commerce is a common use case and lacks detailed examples in the current docs.

## Outline
1. Context: Building a product catalog
2. Challenges: Consistency across product pages
3. Solution: Applied component registry and design tokens
4. Results: 40% faster development, zero visual inconsistencies

## Additional context
I've successfully applied this in 3 real projects.
```

---

## Documentation Standards

### File Structure

```
docs/
├── philosophy/        # Core principles and concepts
├── guides/           # How-to guides and tutorials
├── examples/         # Case studies and real-world examples
├── patterns/         # Reusable patterns (future)
└── reference/        # Technical specifications (future)
```

### Writing Style

**Tone:** Practical, friendly, and accessible
- Use "you" when addressing readers
- Write in active voice
- Keep sentences concise
- Use examples liberally

**Format:**
- Use headers for structure (H2 for sections, H3 for subsections)
- Use code blocks for examples
- Use bullet points for lists
- Use **bold** for emphasis, *italics* for concepts

**Example of good style:**
```markdown
## Component Registry

The component registry tracks all components in your design system. 

**Why it matters:** Without a registry, you'll end up creating duplicate 
components across different pages.

Example:
```typescript
components: {
  Button: {
    path: './components/Button.tsx',
    usedIn: ['/home', '/dashboard']
  }
}
```

### Code Examples

- **Use TypeScript** when showing code examples
- **Include comments** to explain non-obvious parts
- **Show both good and bad examples** when helpful
- **Keep examples minimal** — focus on the concept

**Good example:**
```tsx
// ✅ Good: Uses design token
<button className="bg-primary">Click me</button>

// ❌ Bad: Hardcoded color
<button className="bg-blue-500">Click me</button>
```

### Diagrams and Visuals

- Use **Mermaid** for diagrams when possible
- Keep diagrams simple and focused
- Always provide alt text
- Include a text explanation alongside visual

---

## Case Study Guidelines

When contributing a case study, include:

### 1. Context
- What were you building?
- What was the team size?
- What was the timeframe?

### 2. Challenge
- What problem were you solving?
- Why was coherent design important?
- What alternatives did you consider?

### 3. Application
- How did you apply Coherent Design Method?
- Which principles were most important?
- What tools did you use?

### 4. Results
- What improved?
- What metrics can you share?
- What surprised you?

### 5. Lessons Learned
- What worked well?
- What would you do differently?
- What advice would you give?

**Template:**
```markdown
# Case Study: [Project Name]

## Overview
Brief 2-3 sentence summary.

## Context
- **Industry:** E-commerce
- **Team:** 4 developers, 1 designer
- **Timeline:** 3 months
- **Stack:** React, Next.js, Tailwind

## Challenge
Describe the problem...

## Application
How we applied Coherent Design Method...

## Results
- Metric 1: ...
- Metric 2: ...

## Lessons Learned
What we learned...

## Conclusion
Final thoughts...
```

---

## Review Process

### What We Look For

✅ **Accuracy** — Is the information correct?  
✅ **Clarity** — Is it easy to understand?  
✅ **Value** — Does it help readers?  
✅ **Consistency** — Does it match existing style?  
✅ **Completeness** — Is anything missing?

### Timeline

- **Small changes:** Usually reviewed within 1-2 days
- **Large changes:** May take up to a week for thorough review
- **Complex proposals:** May require multiple rounds of feedback

### Feedback

We aim to provide:
- **Constructive feedback** — Suggestions for improvement
- **Clear expectations** — What needs to change
- **Encouragement** — We appreciate all contributions!

---

## Community Guidelines

### Be Respectful

- **Assume good intentions** — Everyone is here to help
- **Be patient** — Not everyone has the same background
- **Be kind** — Criticism should be constructive
- **Be inclusive** — Welcome all skill levels

### Ask Questions

- **No question is too basic** — We were all beginners once
- **Search first** — Check if your question was already answered
- **Be specific** — Provide context for your question
- **Follow up** — Let us know if the answer helped

### Give Credit

- **Cite sources** — Link to referenced material
- **Acknowledge contributors** — Credit those who helped
- **Respect licenses** — Honor copyright and attribution

---

## Getting Started

Ready to contribute?

1. **Read the existing documentation** to understand the methodology
2. **Look at open issues** for ideas on what needs help
3. **Start small** — Fix a typo or clarify a sentence
4. **Ask questions** if you're unsure about anything

**Issues marked "good first issue"** are great for new contributors!

---

## Recognition

Contributors are recognized in:

- **CONTRIBUTORS.md** — List of all contributors
- **Release notes** — Acknowledgment in updates
- **Documentation** — Credit in contributed sections

Significant contributors may be invited to become:
- **Maintainers** — Help review contributions
- **Core team** — Shape the methodology's future

---

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. We expect all participants to:

- Be respectful and professional
- Be open to collaboration
- Focus on what is best for the community
- Show empathy towards other community members

Unacceptable behavior includes:
- Harassment or discriminatory language
- Trolling or insulting comments
- Public or private harassment
- Publishing others' private information

**Reporting:** If you experience or witness unacceptable behavior, please contact [maintainer email - to be added].

---

## Questions?

- 💬 **Discussion:** Open an issue for general questions
- 📧 **Email:** [To be added] for private inquiries
- 💼 **Professional services:** [To be added] for consulting

---

## License

By contributing to Coherent Design Method, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for helping make Coherent Design Method better!** 🙏

Every contribution, no matter how small, helps make design systems more coherent for everyone.
