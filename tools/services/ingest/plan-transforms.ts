import type { MutationPlan } from "../../lib/core/contracts.js";

/**
 * Appends a tag_update page action for the source note so that
 * topic slugs are written to its frontmatter.
 */
export function injectTopicTags(
  plan: MutationPlan,
  sourceNotePath: string,
  topicSlugs: string[]
): MutationPlan {
  if (topicSlugs.length === 0 || !sourceNotePath) {
    return plan;
  }

  return {
    ...plan,
    page_actions: [
      ...plan.page_actions,
      {
        path: sourceNotePath,
        action: "update",
        doc_type: "source",
        change_type: "tag_update",
        payload: {
          frontmatter: {
            tags: topicSlugs
          }
        }
      }
    ]
  };
}

/**
 * Injects a default confidence value into every "create" page action
 * that does not already specify one.
 */
export function injectDefaultConfidence(plan: MutationPlan, defaultConfidence: string): MutationPlan {
  const injected = plan.page_actions.map((a) => {
    if (a.action !== "create") return a;
    const existingFrontmatter = (a.payload?.frontmatter ?? {}) as Record<string, unknown>;
    if (existingFrontmatter.confidence) return a;
    return {
      ...a,
      payload: {
        ...a.payload,
        frontmatter: { ...existingFrontmatter, confidence: defaultConfidence }
      }
    };
  });

  return { ...plan, page_actions: injected };
}
