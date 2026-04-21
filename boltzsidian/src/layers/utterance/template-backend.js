// Template utterance backend — the default, and the fallback for every
// other backend. Wraps the existing chorus-templates library in the
// Phase 7 backend interface so the chorus and dream layers can route
// through a single call site.
//
// Behaviourally identical to the pre-Phase-7 direct-template path. No
// quality change is intended. The refactor is solely to make room for
// local/Claude variants without forking chorus.js.

import {
  TEMPLATES,
  eligibleTemplates,
  renderTemplate,
} from "../chorus-templates.js";

export function createTemplateBackend({ rng = Math.random } = {}) {
  return {
    id: "template",
    available: () => true,
    ready: async () => true,
    generate: async ({ snapshot, templateHint } = {}) => {
      const snap = snapshot || {};
      const eligible = eligibleTemplates(snap);
      if (eligible.length === 0) {
        throw new Error("template: no eligible templates for snapshot");
      }
      // Hint path: caller wants a specific template id (used for dream
      // caption continuity). Fall back to uniform pick if the hint
      // doesn't match any eligible template.
      let tmpl = null;
      if (templateHint) {
        tmpl = eligible.find((t) => t.text === templateHint) || null;
      }
      if (!tmpl) {
        tmpl = eligible[Math.floor(rng() * eligible.length)];
      }
      const text = renderTemplate(tmpl, snap).replace(/\s+/g, " ").trim();
      if (!text) throw new Error("template: rendered to empty string");
      return {
        text,
        confidence: 1.0,
        backend: "template",
        templateId: tmpl.text,
      };
    },
    cost: () => ({
      latencyMs: 0,
      tokensOut: 0,
      network: false,
      offline: true,
    }),
    templateCount: TEMPLATES.length,
  };
}
