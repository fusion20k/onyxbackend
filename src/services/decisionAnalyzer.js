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
  
  const prompt = `You are Onyx, a decision analysis system. Extract structured information from this decision context.

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
      { role: 'system', content: 'You are a precise decision analysis system. Always respond with valid JSON only.' },
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
  
  const analysisPrompt = `You are Onyx, a decision stress-testing engine. Analyze these options under uncertainty.

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
      { role: 'system', content: 'You are a rigorous decision analyst. Respond with valid JSON only.' },
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
  
  const recPrompt = `You are Onyx. Recommend the most robust option based on stress tests.

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
      { role: 'system', content: 'You are a decision advisor prioritizing robustness over upside. Respond with valid JSON.' },
      { role: 'user', content: recPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3
  });

  return JSON.parse(response.choices[0].message.content);
}

async function answerFollowup(decision, followupHistory, userQuestion) {
  const client = getOpenAIClient();
  
  const context = `Decision: ${decision.title}
Goal: ${decision.goal}
Options: ${decision.options?.map(o => o.name).join(', ')}

Previous conversation:
${followupHistory.map(f => `${f.author_type}: ${f.content}`).join('\n')}

User question: ${userQuestion}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are Onyx. Answer briefly and directly. Focus on helping them commit to a robust decision.' },
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
