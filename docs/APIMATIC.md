\# APIMatic Context Plugin usage log



Tool: APIMatic Context Plugin for PayPal Server SDKs, used inside <editor> during the hackathon build.



| Date | Who | Task | What we asked the agent | What the plugin's context changed / caught | File(s) |

| 2026-11-04 | Ashvin | Ledger read-back API lookup | Asked Copilot (VS Code, PayPal Context Plugin) for the server-SDK 2.5.0 methods to read a capture's status and a refund's amount by ID | Returned `PaymentsController.getCapturedPayment({ captureId })` (matched what we'd already proven) and `getRefund({ refundId })`, which we hadn't used. Verified against real sandbox refunds: $10.00 partial and $40.00 for the amount-omitted refund, both COMPLETED. Saved a docs search; this is the ledger reader's core call. | spikes/src/spike3-readrefund.ts |
