# Agentic Design Patterns: Complete Analysis

**Source:** "Agentic Design Patterns: A Hands-On Guide to Building Intelligent Systems" by Antonio Gulli (Google), 482 pages
**Analysis date:** 2026-04-06
**Purpose:** Extract patterns applicable to the Coherent Design Method CLI tool

---

## Part One: Core Orchestration Patterns (Chapters 1-7)

---

### Chapter 1: Prompt Chaining (Pipeline Pattern)

**One-line description:** Break complex tasks into sequential sub-tasks where each step's output feeds the next step's input.

**Key concept:** Rather than expecting an LLM to solve a complex problem in a single monolithic prompt, decompose it into smaller, focused prompts connected in sequence. Each step can be optimized independently. Structured output (JSON/XML) between steps ensures reliable data passing. The pattern also enables integration of external tools and validation gates between steps.

**Code pattern:**
```python
# LangChain LCEL pattern
extraction_chain = prompt_extract | llm | StrOutputParser()
full_chain = (
    {"specifications": extraction_chain}
    | prompt_transform
    | llm
    | StrOutputParser()
)
result = full_chain.invoke({"text_input": input_text})
```

**Application to Coherent CLI:**
Our pipeline already implements prompt chaining: plan -> generate home -> extract patterns -> generate shared -> generate pages -> quality check -> fix. Key improvements from this chapter:
- Add structured JSON output between every phase (we partially do this with design tokens)
- Add validation gates between steps to catch drift early (e.g., verify extracted patterns before using them in page generation)
- Each phase should have a distinct "role" persona (e.g., "Senior Design System Architect" for planning, "UI Component Specialist" for generation)
- Context engineering: at each step, curate only the most relevant context rather than passing everything

---

### Chapter 2: Routing

**One-line description:** Dynamically direct workflow execution to specialized handlers based on input classification.

**Key concept:** A router agent analyzes incoming requests and delegates to the most appropriate specialized sub-agent or tool. Routing can be LLM-driven (classify intent then branch), rule-based (regex/keyword matching), or embedding-based (semantic similarity). This transforms static linear pipelines into adaptive, context-aware workflows. Frameworks support this via RunnableBranch (LangChain) or sub_agents with Auto-Flow (Google ADK).

**Code pattern:**
```python
# LangChain RunnableBranch pattern
coordinator_agent = RunnableBranch(
    (lambda x: "booker" in x["decision"].lower(), booking_handler),
    (lambda x: "info" in x["decision"].lower(), info_handler),
    unclear_handler  # default
)
```

**Application to Coherent CLI:**
- Route component generation to specialized generators based on component type (form components vs. data display vs. navigation vs. layout)
- Route quality check issues to specialized fix agents (color fix agent, spacing fix agent, accessibility fix agent)
- Route page generation strategy based on page complexity (simple static pages get lightweight generation, complex interactive pages get multi-step generation with reflection)
- Dynamic model selection: route simple component generation to faster/cheaper models, complex architectural decisions to stronger models

---

### Chapter 3: Parallelization

**One-line description:** Execute independent sub-tasks concurrently to reduce total latency.

**Key concept:** When multiple sub-tasks don't depend on each other's output, run them simultaneously. This is especially effective when tasks involve external API calls with latency. The pattern requires identifying independent branches, running them in parallel, and aggregating results at a convergence point. Frameworks provide RunnableParallel (LangChain) or built-in ParallelAgent (Google ADK).

**Code pattern:**
```python
map_chain = RunnableParallel({
    "summary": summarize_chain,
    "questions": questions_chain,
    "key_terms": terms_chain,
    "topic": RunnablePassthrough(),
})
full_chain = map_chain | synthesis_prompt | llm | StrOutputParser()
```

**Application to Coherent CLI:**
We already parallelize page generation. Additional opportunities:
- Parallel extraction: run color extraction, typography extraction, spacing extraction, and component extraction simultaneously from the home page
- Parallel validation: run accessibility checks, color coherence checks, spacing consistency checks, and component API consistency checks concurrently
- Parallel A/B generation: generate 2-3 variants of each shared component in parallel, then select the best one
- Parallel quality checks per page during the QA phase

---

### Chapter 4: Reflection (Generator-Critic)

**One-line description:** An agent evaluates its own output (or a separate critic evaluates it) and iteratively refines until quality criteria are met.

**Key concept:** The pattern introduces a feedback loop: generate -> evaluate -> refine -> repeat. The most robust implementation uses two separate agents: a Producer that generates output and a Critic that evaluates it with different criteria and persona. The critic checks for factual accuracy, coherence, style, completeness, and adherence to instructions. A stopping condition (e.g., "CODE_IS_PERFECT" or max iterations) prevents infinite loops. Trade-offs: higher latency and cost, but significantly better output quality.

**Code pattern:**
```python
# Reflection loop pseudocode
for i in range(max_iterations):
    if i == 0:
        current_output = llm.invoke(task_prompt)
    else:
        current_output = llm.invoke([task_prompt, critique, "Refine based on feedback"])
    
    critique = critic_llm.invoke(f"Review this output: {current_output}")
    
    if "PERFECT" in critique:
        break
```

**Application to Coherent CLI:**
Our quality check + fix cycle is a basic reflection loop. Enhancements:
- Add a dedicated Design Critic agent with a separate prompt focused on visual consistency, design system adherence, and accessibility
- The critic should check against the extracted design tokens/patterns, not just general quality
- Implement multi-round reflection for shared components (they affect all pages, so quality is paramount)
- Add a "design coherence" scoring rubric the critic uses: token usage consistency, spacing rhythm, color palette adherence, component API consistency
- Consider a "self-reflection" step where the generator reviews its own output before sending to the critic

---

### Chapter 5: Tool Use (Function Calling)

**One-line description:** Enable agents to interact with external APIs, databases, and code execution environments through structured function calls.

**Key concept:** The LLM decides when to call external tools based on the task. The process: tool definitions are provided to the LLM -> LLM generates structured JSON specifying tool name + arguments -> framework executes the tool -> result returned to LLM for further processing. Tools extend the LLM beyond its training data. Tool types include: search (Google Search), code execution (sandboxed Python), file operations, API calls, and even other agents-as-tools.

**Code pattern:**
```python
# Google ADK tool definition
def get_stock_price(ticker: str) -> float:
    """Looks up a stock price for a given ticker symbol."""
    prices = {"AAPL": 150.0, "GOOGL": 2800.0}
    return prices.get(ticker, ValueError(f"Unknown ticker: {ticker}"))

agent = Agent(
    name="analyst",
    model="gemini-2.0-flash",
    tools=[FunctionTool(get_stock_price)]
)
```

**Application to Coherent CLI:**
- File system tools: read existing project files, write generated components, check directory structure
- Validation tools: run CSS linting, check color contrast ratios (WCAG), validate TypeScript types
- Code execution tools: execute generated components in a sandbox to check for import errors
- Design token tools: lookup and validate against the project's design token registry
- Screenshot/visual comparison tools: render components and compare visual output against reference

---

### Chapter 6: Planning

**One-line description:** Agent autonomously decomposes a high-level goal into a sequence of actionable steps before execution.

**Key concept:** The Planning pattern transforms reactive agents into strategic executors. The agent takes a complex objective and generates an ordered plan of sub-tasks, considering dependencies and constraints. Plans can be static (generated once upfront) or dynamic (adjusted during execution based on intermediate results). Google DeepResearch exemplifies advanced planning: it creates iterative research plans that adapt and evolve based on continuous information gathering.

**Code pattern:**
```python
# CrewAI planning approach
blog_writer = Agent(
    role="Senior Content Strategist",
    goal="Create a comprehensive blog post with an outline and full draft",
    backstory="Expert content strategist known for engaging posts..."
)
task = Task(
    description="Write a blog post. First create an outline, then write the full post.",
    agent=blog_writer
)
```

**Application to Coherent CLI:**
Our "plan" phase already does this. Enhancements:
- Make the plan more granular: instead of just listing pages, plan the component hierarchy, shared pattern extraction strategy, and page generation order
- Dynamic replanning: if pattern extraction reveals unexpected complexity, replan the component generation strategy
- Plan should include dependency graph (e.g., Button must be generated before Card which uses Button)
- Plan should estimate token budget per phase and allocate accordingly
- Consider generating the plan in structured format (JSON) that the orchestrator can parse and execute programmatically

---

### Chapter 7: Multi-Agent Collaboration

**One-line description:** Multiple specialized agents with distinct roles collaborate to achieve a goal that exceeds any single agent's capability.

**Key concept:** Complex tasks are decomposed and assigned to specialized agents (Research Agent, Design Agent, Code Agent, etc.). Collaboration models include: Sequential Handoffs (pipeline), Parallel Processing, Debate and Consensus, Hierarchical Structures (manager delegates to workers), Expert Teams, and Critic-Reviewer pairs. Communication structures range from Single Agent to Network, Supervisor, Hierarchical, and Custom topologies. The key is defining clear roles, communication channels, and interaction protocols.

**Code pattern:**
```python
# CrewAI multi-agent pattern
researcher = Agent(role="Researcher", tools=[search_tool])
writer = Agent(role="Writer", tools=[])
editor = Agent(role="Editor", tools=[])

crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential
)
```

**Application to Coherent CLI:**
Redesign the pipeline as a multi-agent system:
- **Architect Agent:** analyzes the reference design, creates the component taxonomy and design token schema
- **Pattern Extractor Agent:** specializes in identifying reusable patterns from the home page
- **Component Generator Agent(s):** multiple specialized generators (form components, layout components, data display components)
- **Page Composer Agent:** assembles pages from the shared component library
- **Design QA Agent:** reviews output for visual coherence, accessibility, design system consistency
- **Fix Agent:** applies targeted fixes based on QA feedback
- Use hierarchical structure: Orchestrator -> Phase Managers -> Specialist Workers

---

## Part Two: State and Knowledge Patterns (Chapters 8-11)

---

### Chapter 8: Memory Management

**One-line description:** Manage short-term (session) and long-term (persistent) memory to maintain context across interactions and tasks.

**Key concept:** Three memory layers: Session (current conversation events + state), State (key-value scratchpad within a session), and Long-Term Memory (persistent, searchable knowledge across sessions). State uses prefixes for scoping: `user:` (per-user across sessions), `app:` (shared across all users), `temp:` (current turn only). Memory types include Episodic (past experiences), Semantic (general knowledge), and Procedural (how to do things). Long-term memory enables RAG-based retrieval of relevant past context.

**Code pattern:**
```python
# ADK state management via output_key
agent = LlmAgent(
    name="Greeter",
    model="gemini-2.0-flash",
    instruction="Generate a greeting.",
    output_key="last_greeting"  # auto-saves output to state
)

# State prefixes for scoping
state["user:preferences"] = {...}    # persists across sessions for user
state["app:global_config"] = {...}   # shared across all users
state["temp:current_step"] = "..."   # transient, current turn only
```

**Application to Coherent CLI:**
- **Session state:** Track the current pipeline phase, generated files, design tokens discovered so far, and quality scores
- **Cross-phase memory:** Store extracted design patterns as structured state that later phases can query (e.g., color palette, typography scale, spacing system)
- **Procedural memory:** Cache successful generation strategies for similar component types to reuse in future runs
- **Design token registry as memory:** A persistent, structured store of all extracted and validated design tokens that every agent phase can read from
- **Error memory:** Track what went wrong in previous fix attempts to avoid repeating the same errors

---

### Chapter 9: Learning and Adaptation

**One-line description:** Agents improve their performance over time by learning from experience, feedback, and past results.

**Key concept:** Goes beyond static agents to systems that evolve. Key examples: SICA (Self-Improving Coding Agent) which modifies its own tools and code based on benchmark performance, developing progressively better editing capabilities (basic file overwrite -> Smart Editor -> Diff-Enhanced Editor -> AST-based tools). AlphaEvolve uses LLMs + evolutionary algorithms to discover optimized algorithms. OpenEvolve evolves entire code files through iterative LLM-driven generation, evaluation, and selection. The core loop: generate -> evaluate -> select best -> mutate -> repeat.

**Code pattern:**
```python
# OpenEvolve evolutionary optimization
from openevolve import OpenEvolve
evolve = OpenEvolve(
    initial_program_path="initial_program.py",
    evaluation_file="evaluator.py",
    config_path="config.yaml"
)
best_program = await evolve.run(iterations=1000)
```

**Application to Coherent CLI:**
- Track quality scores across runs and learn which prompt strategies produce better results for different component types
- Evolve system prompts: after each run, evaluate output quality and refine prompts that underperformed
- Build a "pattern library" of successful generations that can be referenced in future runs
- Adaptation based on framework: learn different generation strategies for React vs. Vue vs. Svelte based on accumulated experience
- Self-improving extraction: if pattern extraction misses important tokens, use the QA feedback to improve the extraction prompt

---

### Chapter 10: Model Context Protocol (MCP)

**One-line description:** A standardized open protocol for LLMs to discover and interact with external tools, data sources, and APIs.

**Key concept:** MCP provides a universal adapter (client-server architecture) so any LLM can plug into any external system without custom integration. It standardizes how resources (data), prompts (templates), and tools (actions) are exposed and consumed. Key insight: MCP wrapping a poorly designed API doesn't magically make it agent-friendly. APIs must return agent-readable formats (e.g., Markdown over PDF) and include deterministic features (filtering, sorting) to help the non-deterministic agent work efficiently.

**Code pattern:**
```python
# FastMCP server definition
from fastmcp import FastMCP
mcp = FastMCP("weather-service")

@mcp.tool()
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"Weather in {city}: 72F, sunny"
```

**Application to Coherent CLI:**
- Expose design token operations as MCP tools (lookup token, validate color, check spacing)
- Create MCP servers for framework-specific operations (React component scaffolding, Next.js route creation, Tailwind class validation)
- Enable interoperability: let other AI tools consume our design system via MCP
- MCP server for the component registry: other agents can discover and query available shared components
- Key insight for us: our internal APIs between pipeline phases should be "agent-friendly" -- return structured, focused data rather than raw dumps

---

### Chapter 11: Goal Setting and Monitoring

**One-line description:** Give agents explicit objectives with measurable criteria and track progress toward those goals.

**Key concept:** Agents need SMART goals (Specific, Measurable, Achievable, Relevant, Time-bound) and monitoring mechanisms. The pattern involves: defining success criteria upfront, iteratively generating and evaluating output against those criteria, and using LLM-as-judge to determine if goals are met. The agent enters a loop: generate code -> evaluate against goals -> if not met, generate feedback -> refine -> repeat until goals met or max iterations reached.

**Code pattern:**
```python
# Goal-driven generation loop
def goals_met(feedback_text, goals):
    review_prompt = f"Goals: {goals}\nFeedback: {feedback_text}\nHave goals been met? True/False"
    response = llm.invoke(review_prompt).content.strip().lower()
    return response == "true"

for i in range(max_iterations):
    code = generate_code(use_case, goals, previous_code, feedback)
    feedback = get_code_feedback(code, goals)
    if goals_met(feedback, goals):
        break
```

**Application to Coherent CLI:**
- Define explicit quality goals per phase: "Extracted design tokens must cover: primary/secondary/accent colors, font family/sizes/weights, spacing scale (at least 5 values), border radius values"
- Monitor goal completion: track which design tokens have been extracted vs. which are still missing
- Component generation goals: "Component must use only design tokens from the registry, export proper TypeScript types, include responsive breakpoints"
- Page generation goals: "Page must use only shared components, maintain consistent spacing rhythm, pass color coherence validation"
- End-to-end goal: "All pages must score >= 8/10 on design coherence assessment"

---

## Part Three: Safety and Human Interaction (Chapters 12-14)

---

### Chapter 12: Exception Handling and Recovery

**One-line description:** Detect, handle, and recover from operational failures to maintain agent reliability.

**Key concept:** Three-layer defense: Error Detection (invalid outputs, API errors, timeouts, incoherent responses), Error Handling (logging, retries, fallbacks, graceful degradation, notifications), and Recovery (state rollback, diagnosis, self-correction, escalation). Implementation often uses SequentialAgent with primary handler -> fallback handler -> response agent. This pattern may combine with reflection: if an attempt fails, analyze the failure and retry with a refined approach.

**Code pattern:**
```python
# ADK SequentialAgent fallback pattern
primary_handler = Agent(name="primary", tools=[precise_tool])
fallback_handler = Agent(name="fallback", instruction="If primary failed, use alternate tool")
response_agent = Agent(name="responder", instruction="Present final result")

robust_agent = SequentialAgent(
    name="robust_agent",
    sub_agents=[primary_handler, fallback_handler, response_agent]
)
```

**Application to Coherent CLI:**
- If component generation fails (malformed output, missing imports), retry with simplified prompt before escalating
- Fallback strategies: if complex component generation fails, fall back to simpler component structure
- State rollback: if page generation produces incoherent results, revert to the last valid state and retry with different parameters
- Graceful degradation: if design token extraction is incomplete, proceed with defaults and flag for manual review
- Error logging: track which component types consistently fail to improve prompts over time
- Skip and continue: if one page fails, don't halt the entire pipeline -- skip it, continue with others, report failures at the end

---

### Chapter 13: Human-in-the-Loop (HITL)

**One-line description:** Integrate human judgment into AI workflows for validation, correction, and decision-making in critical situations.

**Key concept:** HITL encompasses: Human Oversight (monitoring via dashboards/logs), Intervention and Correction (humans fix errors, supply missing data), Human Feedback for Learning (RLHF), Decision Augmentation (AI recommends, human decides), Human-Agent Collaboration (AI handles routine, human handles creative/complex), and Escalation Policies (when to hand off). "Human-on-the-loop" variant: humans define policy, AI handles execution within those bounds. Key caveat: HITL doesn't scale -- requires hybrid approach combining automation for scale and HITL for accuracy.

**Code pattern:**
```python
# ADK HITL with escalation
def escalate_to_human(issue_type: str) -> dict:
    return {"status": "success", "message": f"Escalated {issue_type} to human specialist."}

support_agent = Agent(
    instruction="For complex issues beyond basic troubleshooting, use escalate_to_human",
    tools=[troubleshoot_issue, create_ticket, escalate_to_human]
)
```

**Application to Coherent CLI:**
- **Approval gates:** After plan generation, optionally present the plan to the user for approval before proceeding
- **Design review checkpoint:** After shared component generation, show a summary of extracted tokens and component list for user validation
- **Escalation policy:** If quality check fails 3 times on the same component, escalate to the user with specific issues identified
- **Human-on-the-loop mode:** User provides brand guidelines / design constraints upfront, CLI operates autonomously within those bounds
- **Interactive mode vs. autonomous mode:** Let users choose their level of involvement (fully autonomous, checkpoint-based, or fully interactive)

---

### Chapter 14: Knowledge Retrieval (RAG)

**One-line description:** Connect LLMs to external, up-to-date knowledge sources to ground outputs in verifiable data.

**Key concept:** RAG addresses static knowledge limitations by: retrieving relevant documents from external sources using embeddings and semantic search, then augmenting the LLM's prompt with that context. Advanced variants: Agentic RAG adds a reasoning layer to validate and reconcile retrieved knowledge. GraphRAG uses knowledge graphs to navigate explicit data relationships. Key technologies: embeddings (convert text to vectors), vector databases (store and search embeddings), and chunking strategies (split documents into searchable segments).

**Code pattern:**
```python
# RAG conceptual flow
query_embedding = embed(user_query)
relevant_docs = vector_db.similarity_search(query_embedding, k=5)
augmented_prompt = f"Context: {relevant_docs}\n\nQuestion: {user_query}"
response = llm.invoke(augmented_prompt)
```

**Application to Coherent CLI:**
- **Design system RAG:** Index the target framework's documentation (React, Next.js, Tailwind, etc.) and retrieve relevant patterns during generation
- **Component library RAG:** Index popular component libraries (shadcn/ui, Radix, Headless UI) to inform component design decisions
- **Project context RAG:** Index the user's existing codebase to match existing patterns and conventions
- **Design token RAG:** Store and retrieve design tokens by semantic meaning (e.g., "warning color" -> finds the right token regardless of naming convention)
- **Best practices RAG:** Index accessibility guidelines (WCAG), design principles, and framework-specific best practices

---

## Part Four: Advanced Patterns (Chapters 15-21)

---

### Chapter 15: Inter-Agent Communication (A2A)

**One-line description:** An open protocol enabling AI agents from different frameworks to discover each other and collaborate via standardized HTTP-based communication.

**Key concept:** Google's A2A protocol enables cross-framework agent interoperability. Core concepts: Agent Cards (JSON identity/capability descriptors hosted at /.well-known/agent.json), Agent Discovery (well-known URI, curated registries, direct configuration), Tasks (asynchronous units of work with state transitions), and multiple interaction modes (synchronous request/response, async polling, streaming via SSE, push notifications via webhooks). Communication uses JSON-RPC 2.0 over HTTPS.

**Code pattern:**
```json
// Agent Card example
{
    "name": "WeatherBot",
    "url": "http://weather-service.example.com/a2a",
    "capabilities": { "streaming": true, "pushNotifications": false },
    "skills": [{ "id": "get_forecast", "name": "Get Forecast" }]
}
```

**Application to Coherent CLI:**
- Expose the Coherent CLI as an A2A-compatible agent that other tools can discover and invoke
- Agent Card for Coherent: describe capabilities like "design system generation", "component extraction", "design token analysis"
- Enable integration with external design tools (Figma agents, Storybook agents) via A2A protocol
- Enable integration with CI/CD agents that can trigger design system regeneration
- Future: let multiple Coherent instances collaborate on different parts of a large design system

---

### Chapter 16: Resource-Aware Optimization

**One-line description:** Dynamically manage computational, temporal, and financial resources by routing tasks to appropriate models and optimizing resource usage.

**Key concept:** Key technique: Router Agent that classifies prompt complexity and routes to appropriate models (simple queries -> small/fast model, reasoning queries -> powerful model, search queries -> model + search tool). Additional strategies: Adaptive Tool Use (select tools based on cost/benefit), Contextual Pruning & Summarization (reduce context length), Proactive Resource Prediction, Cost-Sensitive Exploration, Graceful Degradation, and Critique Agent for self-correction. A dedicated Critique Agent monitors performance and refines routing logic.

**Code pattern:**
```python
# Model routing based on complexity
def classify_prompt(prompt):
    classification = llm.invoke("Classify: simple/reasoning/internet_search")
    return classification

def generate_response(prompt, classification):
    if classification == "simple": model = "gpt-4o-mini"
    elif classification == "reasoning": model = "o4-mini"
    elif classification == "internet_search": model = "gpt-4o"
    return client.chat(model=model, prompt=prompt)
```

**Application to Coherent CLI:**
- Route simple component generation (buttons, badges) to faster/cheaper models
- Route complex layout components (data tables, forms with validation) to more capable models
- Context pruning: when generating page N, only include relevant shared components in context, not the entire library
- Token budget management: track token usage per phase and alert if approaching limits
- Cost estimation upfront: during planning, estimate total token cost and present to user
- Graceful degradation: if hitting rate limits, reduce parallelism or switch to smaller models
- Prioritize critical components: generate core shared components with best model, utility components with faster model

---

### Chapter 17: Reasoning Techniques

**One-line description:** Advanced methods for making an agent's internal reasoning explicit, enabling multi-step logical inference and problem-solving.

**Key concept:** Multiple reasoning paradigms: Chain-of-Thought (CoT) -- step-by-step reasoning; Tree-of-Thought (ToT) -- explore multiple reasoning paths as a tree, enabling backtracking; Self-Correction/Self-Refinement -- iterative internal review; Program-Aided Language Models (PALMs) -- generate and execute code for precise computation; ReAct (Reasoning + Acting) -- interleave thinking with tool use in a loop; Chain of Debates (CoD) -- multiple models argue to find robust solutions; Graph of Debates (GoD) -- non-linear debate as a network. RLVR (Reinforcement Learning with Verifiable Rewards) trains models to develop extended reasoning. MASS framework optimizes multi-agent system topology and prompts through multi-stage optimization.

**Code pattern:**
```
# ReAct loop pseudocode
while not done:
    thought = llm.think("What should I do next?")
    action = llm.select_tool(thought)
    observation = execute_tool(action)
    thought = llm.think(f"I observed: {observation}. What now?")
```

**Application to Coherent CLI:**
- Use CoT prompting in the planning phase: "Think step-by-step about what components this design system needs"
- Use ToT for design decisions: explore multiple component architecture paths (atomic design vs. compound components vs. headless pattern) and evaluate each
- Self-correction in generation: after generating a component, have the agent review it against the design tokens and fix inconsistencies
- ReAct for pattern extraction: observe the home page -> reason about which patterns to extract -> extract a pattern -> observe the result -> reason about what's missing -> extract more
- PALMs for precise calculations: use code execution to calculate exact color contrast ratios, spacing scales, responsive breakpoints
- MASS-inspired optimization: systematically optimize our prompts for each pipeline phase through automated evaluation

---

### Chapter 18: Guardrails/Safety Patterns

**One-line description:** Protective mechanisms ensuring agents operate safely, ethically, and as intended through input validation, output filtering, and behavioral constraints.

**Key concept:** Multi-layered defense: Input Validation/Sanitization (filter malicious content), Output Filtering/Post-processing (check for toxicity, bias), Behavioral Constraints (prompt-level instructions), Tool Use Restrictions (limit agent capabilities), External Moderation APIs, and Human Oversight. Implementation includes Pydantic models for structured output validation, dedicated guardrail agents using faster/cheaper models for pre-screening, structured logging for audit trails, and retry logic with exponential backoff. Guardrails should guide, not restrict -- they ensure robust, trustworthy operation.

**Code pattern:**
```python
# Pydantic guardrail for output validation
class PolicyEvaluation(BaseModel):
    compliance_status: str  # "compliant" or "non-compliant"
    evaluation_summary: str
    triggered_policies: List[str]

def validate_output(output) -> Tuple[bool, Any]:
    try:
        evaluation = PolicyEvaluation.model_validate_json(output)
        return True, evaluation
    except ValidationError:
        return False, "Invalid output format"
```

**Application to Coherent CLI:**
- **Input validation:** Validate user-provided design references (URL accessibility, image format, file existence)
- **Output validation:** Every generated component must pass Pydantic schema validation (correct exports, required props, TypeScript types)
- **Design guardrails:** Enforce design system rules -- no raw color values (must use tokens), no magic numbers for spacing, consistent naming conventions
- **Color coherence gate:** Our existing color validation system is a guardrail -- enforce it more strictly
- **Behavioral constraints:** Instruct generation agents to never use inline styles, always use semantic HTML, always include ARIA attributes
- **Code quality guardrails:** Run generated code through ESLint/Prettier validation as a post-processing step
- **Structured logging:** Log every generation attempt with inputs, outputs, and quality scores for debugging

---

### Chapter 19: Evaluation and Monitoring

**One-line description:** Systematically measure agent performance, monitor operational health, and detect quality drift over time.

**Key concept:** Key metrics: Response Accuracy (exact match, semantic similarity, LLM-as-Judge), Latency Monitoring (track time per phase), Token Usage (cost management), and Custom Quality Metrics (domain-specific rubrics). LLM-as-a-Judge: use an LLM to evaluate another agent's output against a detailed rubric with scoring criteria. Multi-agent evaluation: assess both individual agent performance and team dynamics (cooperation, plan adherence, avoiding loops). ADK provides built-in evaluation tools with test files and evalsets for automated testing.

**Code pattern:**
```python
# LLM-as-Judge rubric (conceptual)
RUBRIC = """
Score 1-5 on: Clarity, Neutrality, Relevance, Completeness, Appropriateness
Output as JSON: {overall_score, rationale, detailed_feedback, concerns, recommended_action}
"""

class LLMJudge:
    def evaluate(self, question, rubric=RUBRIC):
        response = model.generate(rubric + question)
        return json.loads(response)
```

**Application to Coherent CLI:**
- **Design coherence score:** LLM-as-Judge evaluating each component against the design token registry (1-10 scale)
- **Component completeness score:** Does the component have proper types, props, responsive behavior, accessibility?
- **Page consistency score:** Does the page maintain consistent spacing, color usage, component API patterns?
- **Latency monitoring:** Track generation time per component and per page to identify bottlenecks
- **Token usage tracking:** Monitor token consumption per phase to optimize prompts and control costs
- **Drift detection:** Compare quality scores across runs to detect if prompt changes degraded output
- **Automated regression testing:** Create evalsets of expected component outputs for different design inputs

---

### Chapter 20: Prioritization

**One-line description:** Enable agents to rank tasks by urgency, importance, dependencies, and cost to focus on the most critical work first.

**Key concept:** Criteria for prioritization: Urgency (time sensitivity), Importance (impact on primary objective), Dependencies (prerequisites), Resource Availability (tools/information readiness), Cost/Benefit (effort vs. outcome). Dynamic re-prioritization allows adapting as circumstances change. Prioritization occurs at multiple levels: strategic goals, sub-task ordering, and immediate action selection. Implementation typically uses a task management system with priority levels (P0/P1/P2) and dependency tracking.

**Code pattern:**
```python
# Task prioritization with dependency tracking
class Task(BaseModel):
    id: str
    description: str
    priority: Optional[str] = None  # P0, P1, P2
    assigned_to: Optional[str] = None

class TaskManager:
    def create_task(self, description: str) -> Task: ...
    def update_task(self, task_id: str, **kwargs) -> Task: ...
    def list_all_tasks(self) -> str: ...
```

**Application to Coherent CLI:**
- **Component generation order:** Prioritize foundational components (Button, Input, Typography) before composite ones (Card, Form, Dialog)
- **Dependency-aware scheduling:** Generate components in dependency order -- tokens first, then primitives, then compounds
- **Critical path optimization:** Identify which components are used most across pages and generate/validate those first
- **Fix prioritization:** When quality check finds multiple issues, fix the most impactful ones first (broken imports > color inconsistency > spacing tweaks)
- **Page generation priority:** Generate pages with more shared component usage first (validates the component library sooner)
- **Resource allocation:** Allocate more compute budget to shared components (high impact) vs. page-specific components (lower impact)

---

### Chapter 21: Exploration and Discovery

**One-line description:** Agents proactively seek novel information, uncover patterns, and generate new knowledge in open-ended domains.

**Key concept:** Unlike optimization within a known space, exploration ventures into unknown territory. Google Co-Scientist exemplifies this with a multi-agent framework: Generation agent (creates hypotheses), Reflection agent (peer reviews), Ranking agent (Elo-based tournament), Evolution agent (refines top ideas), Proximity agent (clusters similar ideas), Meta-review agent (synthesizes insights). Agent Laboratory automates research: literature review -> experimentation -> report writing -> knowledge sharing. Uses "test-time compute scaling" -- allocating more compute resources to iteratively reason and enhance outputs.

**Code pattern:**
```python
# Multi-agent exploration (Agent Laboratory pattern)
class ReviewersAgent:
    def inference(self, plan, report):
        review_1 = get_score(plan, report, reviewer_type="harsh but fair, expects good experiments")
        review_2 = get_score(plan, report, reviewer_type="critical, looking for impactful ideas")
        review_3 = get_score(plan, report, reviewer_type="open-minded, looking for novelty")
        return f"Reviewer #1:\n{review_1}\nReviewer #2:\n{review_2}\nReviewer #3:\n{review_3}"
```

**Application to Coherent CLI:**
- **Design exploration mode:** Given a reference design, explore multiple design system architectures (atomic design, component-driven, utility-first) and compare
- **Pattern discovery:** Proactively identify design patterns not explicitly requested (e.g., discover that several pages share a common card layout and suggest extracting it)
- **Innovation suggestions:** After generating the base system, suggest improvements (dark mode support, animation tokens, responsive token scales)
- **Competitive analysis:** Compare the generated design system against industry standards and suggest gaps to fill
- **Multi-perspective review:** Use multiple reviewer personas (designer, developer, accessibility expert, performance engineer) to evaluate the generated system from different angles

---

## Appendices

---

### Appendix A: Advanced Prompting Techniques

**Key techniques for Coherent CLI:**

1. **Core Principles:**
   - Clarity and Specificity: unambiguous instructions with precise output requirements
   - Conciseness: direct phrasing, active verbs (Analyze, Extract, Generate, Create, Categorize)
   - Instructions Over Constraints: tell the model what TO do, not what NOT to do
   - Experimentation and Iteration: prompt engineering is iterative; document attempts

2. **Basic Techniques:**
   - Zero-Shot: for tasks the model knows well (e.g., "Generate a React button component")
   - Few-Shot: provide 3-5 examples of desired output format (critical for our component generation -- show example components)
   - Many-Shot: modern long-context models can use hundreds of examples for complex patterns

3. **Structuring Techniques:**
   - System Prompting: define agent persona and operational parameters
   - Role Prompting: "You are a Senior Design System Architect..."
   - Delimiters: use XML tags to separate instructions, context, examples, and input
   - Context Engineering: dynamically provide relevant background (design tokens, existing components, framework docs)
   - Structured Output: enforce JSON/XML output with explicit schema definitions
   - Pydantic validation: parse LLM output into validated Python objects for type safety

4. **Reasoning Techniques:**
   - Chain-of-Thought: "Think step-by-step about the component hierarchy"
   - Step-Back Prompting: "What are the key factors of a good design system?" before generating one
   - Tree of Thoughts: explore multiple design approaches concurrently
   - Self-Consistency: generate multiple answers, pick the most common one

5. **Action Techniques:**
   - ReAct: interleave reasoning with tool use
   - Function Calling: structured tool invocation
   - Code Prompting: generate and execute code as part of reasoning

6. **Meta Techniques:**
   - Automatic Prompt Engineering (APE): use LLMs to optimize prompts
   - Factored Cognition: break complex reasoning into specialized sub-tasks
   - Iterative Refinement: progressively improve output through feedback loops

---

### Appendix C: Agentic Frameworks Comparison

| Framework | Core Abstraction | Workflow Type | State Management | Best For |
|-----------|-----------------|---------------|-------------------|----------|
| **LangChain** | Chain (LCEL) | Linear DAG | Stateless per run | Simple, predictable sequences |
| **LangGraph** | Graph of Nodes | Cyclical with loops | Explicit, persistent state | Complex, dynamic, stateful agents |
| **Google ADK** | Agent teams | Pre-built patterns (Sequential/Parallel) | Implicit, framework-managed | Production multi-agent systems |
| **CrewAI** | Role-based teams | Sequential or Hierarchical | Abstracted | Collaborative multi-agent simulation |
| **AutoGen** | Conversational agents | Conversation-driven | Dynamic | Complex multi-agent interactions |
| **LlamaIndex** | Data framework | Data pipelines | Data-centric | RAG and data retrieval |
| **Haystack** | Pipeline nodes | Search pipelines | Modular | Enterprise search at scale |

**Relevance for Coherent CLI:** Our TypeScript/Node.js implementation should adopt the conceptual patterns from these frameworks (especially the graph-based state management from LangGraph and the role-based agent teams from CrewAI) without necessarily using these Python libraries directly.

---

### Appendix G: Coding Agents

**Key insights for our tool:**

1. **Human-Led Orchestration:** The developer is always the team lead. AI agents are force multipliers, not replacements. The human provides architectural vision; agents handle specialized tasks.

2. **The Primacy of Context:** An agent's output quality is entirely dependent on context quality. Our CLI must curate precise context for each generation step:
   - Complete codebase context (existing components, patterns)
   - External knowledge (framework docs, design system docs)
   - Human brief (brand guidelines, design constraints)

3. **Specialist Agent Roles for Coding:**
   - Scaffolder Agent: writes new code from specifications
   - Test Engineer Agent: generates comprehensive tests
   - Documenter Agent: creates documentation
   - Optimizer Agent: proposes refactoring and performance improvements
   - Process Agent (Code Supervisor): performs critique then reflects on its own critique to prioritize feedback

4. **Context Staging Area:** Create a temporary directory with markdown files for goals, code files, and relevant docs before each agent invocation.

5. **Version-Controlled Prompt Library:** Store agent prompts as markdown files in a /prompts directory, treating them as code that can be versioned, reviewed, and refined.

6. **Git Hook Integration:** Use pre-commit hooks to trigger review agents on staged changes.

**Application to Coherent CLI:**
- Structure each pipeline phase as a specialist agent invocation with curated context
- Create a `/prompts` directory with versioned prompt templates for each generation phase
- Implement a "Code Supervisor" agent that does critique + reflection on generated output
- Build a context staging pipeline that assembles the minimal, relevant context for each generation step

---

## Cross-Cutting Themes and Synthesis

### Top 10 Patterns Most Relevant to Coherent CLI

1. **Prompt Chaining (Ch.1):** Foundation of our pipeline -- refine with structured JSON between phases and validation gates
2. **Reflection/Generator-Critic (Ch.4):** Upgrade our QA+fix cycle to a proper Producer-Critic loop with design-specific rubrics
3. **Parallelization (Ch.3):** Already used for page generation; extend to extraction, validation, and A/B component generation
4. **Planning (Ch.6):** Make our plan phase generate structured dependency graphs with token budgets
5. **Multi-Agent Collaboration (Ch.7):** Redesign pipeline as specialized agent team with clear roles
6. **Memory Management (Ch.8):** Implement design token registry as persistent, queryable memory across phases
7. **Guardrails (Ch.18):** Enforce design system rules programmatically (no raw colors, consistent naming, valid TypeScript)
8. **Evaluation & Monitoring (Ch.19):** Add LLM-as-Judge scoring rubrics for design coherence, component completeness
9. **Resource-Aware Optimization (Ch.16):** Route simple vs. complex components to different models
10. **Exception Handling (Ch.12):** Add fallback strategies and graceful degradation to every pipeline phase

### Architecture Recommendations

1. **Context Engineering is King:** The book repeatedly emphasizes that output quality depends more on context quality than model capability. Our biggest leverage point is curating precise, minimal context for each generation step.

2. **Structured Output Everywhere:** Use Pydantic-style validation (Zod in TypeScript) for all inter-phase data. Every phase should produce and consume validated schemas.

3. **Feedback Loops, Not Linear Pipes:** Transform our linear pipeline into a graph with feedback loops. The quality check should feed back into generation with specific, structured critique.

4. **Separation of Concerns:** Each agent should have ONE job. Extracting patterns and generating components should be separate agents, not combined prompts.

5. **Progressive Refinement:** Don't aim for perfect output in one pass. Generate a rough draft, critique it, refine it. This is more reliable and produces higher quality than single-shot generation.

6. **Design Token Registry as Central Memory:** The design token system should be a first-class data structure (like ADK's State) that all agents read from and validate against. This is the shared source of truth.

7. **Cost-Aware Pipeline:** Track token usage per phase, route to appropriate models, and give users visibility into cost vs. quality trade-offs.
