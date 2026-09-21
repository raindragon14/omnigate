# Pull Request Checklist

## Description

Brief summary of changes and motivation.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring
- [ ] Documentation
- [ ] Test improvement
- [ ] CI/Build

## Testing

- [ ] All existing tests pass (`bun test`)
- [ ] TypeScript strict check passes (`bun run typecheck`)
- [ ] Prettier formatting applied (`bun x prettier --write .`)
- [ ] New tests added for new functionality
- [ ] Manual testing performed (describe below)

### Manual Testing Steps

1.
2.
3.

## Breaking Changes

- [ ] No breaking changes
- [ ] Breaking changes documented below

### Breaking Change Details

If applicable, describe what breaks and migration path.

## Checklist

- [ ] Code follows project conventions (see CONTRIBUTING.md)
- [ ] No `any` types introduced
- [ ] No console.log left in production code
- [ ] Environment variables documented in .env.example
- [ ] CHANGELOG.md updated under "Unreleased"
- [ ] Provider registry changes tested locally

## Screenshots / Logs (if applicable)

## Related Issues

Closes #<issue_number>
