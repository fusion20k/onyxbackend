const OpenAI = require('openai');

let openai = null;

function getOpenAIClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

async function extractUnderstanding(rawInput) {
  const client = getOpenAIClient();
  
  const systemPrompt = `You are Onyx, a high-level decision analysis engine.

Your role is not to encourage, reassure, or brainstorm.
Your role is to analyze how a user's proposed plan is likely to play out over time, identify where it holds, where it breaks, and what decision path is most robust given uncertainty.

Operating principles:
- Treat every input as a real decision with real consequences.
- Assume incomplete information; explicitly reason under uncertainty.
- Optimize for clarity, direction, and decision confidence, not entertainment.
- Be concise, structured, and precise. Avoid filler, platitudes, or generic advice.
- When assumptions matter, surface them explicitly.
- Prefer robust strategies over fragile, high-variance ones unless upside clearly dominates.

For extraction tasks, respond with valid JSON only.`;

  const prompt = `Extract structured information from this decision context.

User's input:
"""
${rawInput}
"""

Extract and return a JSON object with:
{
  "title": "One sentence decision title",
  "goal": "What they want to achieve",
  "primary_metric": "What to measure (MRR, time, churn, etc.)",
  "time_horizon": "How far ahead (e.g., '6 months', '1 year')",
  "constraints": ["constraint 1", "constraint 2"],
  "risk_tolerance": "conservative|balanced|aggressive",
  "options": [
    {"name": "Option A", "description": "Brief description"},
    {"name": "Option B", "description": "Brief description"}
  ]
}

Be concise. If something is unclear, make a reasonable inference.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  });

  const extracted = JSON.parse(response.choices[0].message.content);
  return extracted;
}

async function runStressTests(decision, options) {
  const client = getOpenAIClient();
  
  const systemPrompt = `You are Onyx, a high-level decision analysis engine.

Simulate how plans evolve under multiple futures:
- Best-case (assumptions hold unusually well)
- Most-likely (reasonable execution and outcomes)
- Downside / failure mode (assumptions break)

Identify:
- Where constraints are hit
- Where risk compounds
- Which assumption carries the most downside if wrong

Respond with valid JSON only.`;

  const analysisPrompt = `Stress-test these options under uncertainty.

Decision: ${decision.title}
Goal: ${decision.goal}
Time Horizon: ${decision.time_horizon}
Constraints: ${decision.constraints?.join(', ')}

Options to analyze:
${options.map((opt, i) => `${i + 1}. ${opt.name}: ${opt.description}`).join('\n')}

For each option, provide stress test analysis in this JSON format:
{
  "options": [
    {
      "name": "Option A",
      "upside": "Best case outcome in 1 sentence",
      "downside": "Worst case failure in 1 sentence",
      "key_assumptions": ["assumption 1", "assumption 2", "assumption 3"],
      "fragility_score": "fragile|balanced|robust",
      "success_probability": 65.5,
      "constraint_violation_risk": 15.0,
      "assumption_sensitivity": 45.0
    }
  ]
}

Fragility scoring:
- "fragile": Breaks easily if assumptions are off
- "balanced": Moderate resilience
- "robust": Works across many scenarios

Perturb assumptions by ±30-50% to test resilience.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: analysisPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4
  });

  const analysis = JSON.parse(response.choices[0].message.content);
  return analysis.options;
}

async function generateRecommendation(decision, stressTestResults) {
  const client = getOpenAIClient();
  
  const systemPrompt = `You are Onyx, a high-level decision analysis engine.

Your role is to identify which decision path is most robust given uncertainty.

Operating principles:
- Be direct and honest, even when uncomfortable.
- Do not moralize, validate emotions, or hedge excessively.
- Prefer robust strategies over fragile, high-variance ones unless upside clearly dominates.

Respond with valid JSON only.`;

  const recPrompt = `Recommend the most robust option based on stress tests.

Decision: ${decision.title}
Goal: ${decision.goal}
Risk Tolerance: ${decision.risk_tolerance}

Stress test results:
${JSON.stringify(stressTestResults, null, 2)}

Provide recommendation as JSON:
{
  "recommended_option_name": "Option B",
  "reasoning": "2-3 sentence explanation of why this is most robust",
  "why_not_alternatives": "Brief comparison: why not the other options?"
}

Focus on: Which option stays viable across most scenarios, not just best-case.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: recPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  });

  return JSON.parse(response.choices[0].message.content);
}

async function answerFollowup(decision, followupHistory, userQuestion) {
  const client = getOpenAIClient();
  
  const systemPrompt = `You are Onyx, a high-level decision analysis engine.

Your role is to help users commit to robust decisions by:
- Being direct and honest, even when uncomfortable
- Not moralizing, validating emotions, or hedging excessively
- Never defaulting to "it depends" without explaining what it depends on
- Asking only minimum clarifying questions when needed, explaining why they matter

Focus on helping them reach:
1. Reduced cognitive load
2. Increased confidence in a concrete next step
3. Clear understanding of tradeoffs and risk`;

  const context = `Decision: ${decision.title}
Goal: ${decision.goal}
Options: ${decision.options?.map(o => o.name).join(', ')}

Previous conversation:
${followupHistory.map(f => `${f.author_type}: ${f.content}`).join('\n')}

User question: ${userQuestion}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context }
    ],
    temperature: 0.5,
    max_tokens: 300
  });

  return response.choices[0].message.content;
}

module.exports = {
  extractUnderstanding,
  runStressTests,
  generateRecommendation,
  answerFollowup
};
