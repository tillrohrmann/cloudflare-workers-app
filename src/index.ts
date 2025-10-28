import * as restate from "@restatedev/restate-sdk-cloudflare-workers/fetch";
import { multiAgentClaimApproval, eligibilityAgent, humanApprovalWorfklow } from "./multi-agent.js";

export default {
  fetch: restate.createEndpointHandler({
    services: [multiAgentClaimApproval, eligibilityAgent, humanApprovalWorfklow],
    defaultServiceOptions: {
      retryPolicy: {
        initialInterval: { milliseconds: 100 },
        onMaxAttempts: "pause",
        maxAttempts: 3,
      },
      inactivityTimeout: {
        seconds: 5,
      },
    },
  }),
};
