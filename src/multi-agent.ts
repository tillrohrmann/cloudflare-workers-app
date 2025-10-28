import * as restate from "@restatedev/restate-sdk";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, wrapLanguageModel } from "ai";
import { durableCalls } from "@restatedev/vercel-ai-middleware";
import { z } from "zod";

export const multiAgentClaimApproval = restate.service({
  name: "MultiAgentClaimApproval",
  handlers: {
    run: async (ctx: restate.Context, claim: InsuranceClaim) => {
      const model = wrapLanguageModel({
        model: openai("gpt-4o"),
        middleware: durableCalls(ctx),
      });

      const { text } = await generateText({
        model,
        prompt: `Claim: ${JSON.stringify(claim)}`,
        system:
          "You are an insurance claim evaluation agent. First check whehter a claim is eligible. Then use these rules:" +
          "* if the amount is more than 1000, ask for human approval, " +
          "* if the amount is less than 1000, decide by yourself",
        tools: {
          analyzeEligibility: tool({
            description: "Analyze claim eligibility.",
            inputSchema: InsuranceClaimSchema,
            execute: async (claim: InsuranceClaim) => ctx.serviceClient(eligibilityAgent).run(claim),
          }),
          humanApproval: tool({
            description: "Ask for human approval for high-value claims.",
            inputSchema: InsuranceClaimSchema,
            execute: async (claim: InsuranceClaim) => ctx.serviceClient(humanApprovalWorfklow).requestApproval(claim),
          }),
        },
        stopWhen: [stepCountIs(10)],
        providerOptions: { openai: { parallelToolCalls: false } },
      });

      return text;
    },
  },
});

export const humanApprovalWorfklow = restate.service({
  name: "HumanApprovalWorkflow",
  handlers: {
    requestApproval: async (ctx: restate.Context, claim: InsuranceClaim) => {
      const approval = ctx.awakeable<boolean>();
      await ctx.run("request-review", () => requestHumanReview(claim, approval.id));
      return approval.promise;
    },
  },
});

export const InsuranceClaimSchema = z.object({
  date: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  placeOfService: z.string().nullable().optional(),
});

export type InsuranceClaim = z.infer<typeof InsuranceClaimSchema>;

export const eligibilityAgent = restate.service({
  name: "EligibilityAgent",
  handlers: {
    run: async (ctx: restate.Context, claim: InsuranceClaim) => {
      const model = wrapLanguageModel({
        model: openai("gpt-4o"),
        middleware: durableCalls(ctx, { maxRetryAttempts: 3 }),
      });
      const { text } = await generateText({
        model,
        system:
          "Decide whether the following claim is eligible for reimbursement." +
          "Respond with eligible if it's a medical claim, and not eligible otherwise.",
        prompt: JSON.stringify(claim),
      });
      return text;
    },
  },
});

export function requestHumanReview(
  claim: InsuranceClaim,
  responseId: string = "",
) {
  console.log(`🔔 Human review requested: Please review: ${JSON.stringify(claim)} \n
  Submit your claim review via: \n
    curl localhost:8080/restate/awakeables/${responseId}/resolve --json 'true'
  `);
}
