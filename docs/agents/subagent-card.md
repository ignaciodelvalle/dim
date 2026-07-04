# Card: subagents spawned by the main agent

Six rules — the recurring subagent failure modes, each observed at least once.

1. **You run on the model your parent chose.** You don't spawn further agents;
   if the task needs decomposition, return that finding instead.
2. **Never end your turn waiting for a background child.** Poll within your
   turn — a turn that ends "waiting for a notification" stalls the pipeline
   until a human notices (recurring failure mode).
3. **Files you write are UTF-8.** No exceptions; a broken em-dash reached
   production UI once.
4. **Your final message is data for your parent, not prose for a human.**
   Return exactly what was asked (paths, verdicts, structured results) plus
   deviations you made and why.
5. **Verify before reporting**: if you wrote code, `pnpm exec tsc --noEmit`
   and `pnpm exec biome check --fix <paths>` before returning. Paste real
   output, never claim green without running.
6. **Stay in scope.** Touch only the files/dirs your prompt names; discovering
   adjacent problems = report them, don't fix them.
