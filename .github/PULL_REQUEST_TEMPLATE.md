<!-- Fill in Summary, Type of change, and Test plan. Remove optional sections that do not apply. -->

## Summary

<!-- Describe the problem, the change, and what a user or maintainer will notice. -->

## Related issues

<!-- Link issues or discussions. Use Fixes #<issue-number> only when this PR should close that issue. -->

## Type of change

- [ ] Bug fix
- [ ] Feature or behavior change
- [ ] Tests, documentation, or maintenance
- [ ] Dependency update

## Test plan

<!--
List the commands you ran and what passed. Include manual steps a reviewer can repeat and any gaps in verification.
For web UI, name the browsers and check desktop, narrow screens, and keyboard use.
For mobile UI, name the device, emulator, or simulator and its OS version.
For sync and persistence, describe offline recovery, retries with the same mutation ID, and conflicts with newer server data when relevant. Verify that unsent work survives failures.
For permission changes, cover both allowed and denied actions.
-->

<!-- Check only the commands you ran. Remove commands that do not apply. -->

- [ ] `npm run check`
- [ ] `npm run test:e2e` after building the web app, for web UI or workflow changes
- [ ] `npm run check:expo` for native dependency changes

## Screenshots or recordings

<!-- For UI changes, show the affected states and note the viewport or device. Use synthetic data. -->

## Compatibility and rollout

<!-- Describe API, data, or configuration changes, migration or rollout steps, and breaking behavior. For dependency updates, link release notes and explain compatibility. Include a short release note when users need to know about the change. -->

## Contributor checklist

- [ ] The PR covers one focused change.
- [ ] Relevant tests and documentation are included.
- [ ] Fixtures and screenshots use synthetic data, and the diff contains no credentials or customer data.
