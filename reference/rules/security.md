# Security Guidelines

## CRITICAL RULE: API Key Protection (HIGHEST PRIORITY)

**ASSUMPTION: All code may eventually be published as open source.**

ABSOLUTE REQUIREMENTS:
1. **NEVER hardcode API keys, tokens, or secrets anywhere in code**
2. **NEVER commit API keys to version control (not even in logs, comments, or test files)**
3. **NEVER log API keys in application logs, error messages, or debug output**
4. **ALWAYS use environment variables for all secrets**
5. **ALWAYS add .env, .env.*, credentials.json, etc. to .gitignore**
6. **ALWAYS sanitize error objects before logging (remove headers, config, etc.)**
7. **ALWAYS review git status and diffs before committing to ensure no keys are present**

If API key is accidentally committed:
1. STOP immediately - do NOT push
2. Remove from git history using `git filter-branch` or BFG Repo-Cleaner
3. Rotate the exposed key immediately
4. Add the key pattern to .gitignore
5. Review all log files and sanitize them

If API key is found in logs:
1. Delete the log entries immediately
2. Update logging code to sanitize sensitive data
3. Add logging filters to prevent future exposure
4. Consider rotating the key if logs were shared

## Mandatory Security Checks

Before ANY commit:
- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] All user inputs validated
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (sanitized HTML)
- [ ] CSRF protection enabled
- [ ] Authentication/authorization verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak sensitive data

## Secret Management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured')
}
```

## Secure Logging Practices

When implementing logging:
```typescript
// NEVER: Log entire error objects
logger.error('API call failed', error)

// ALWAYS: Sanitize error objects
const sanitizedError = {
  message: error.message,
  status: error.response?.status,
  // NEVER include: headers, config, authorization
}
logger.error('API call failed', sanitizedError)
```

Logging middleware checklist:
- [ ] Remove Authorization headers
- [ ] Remove API keys from config objects
- [ ] Remove tokens from request/response bodies
- [ ] Sanitize user passwords and PII
- [ ] Use allowlist approach (log only safe fields)

## Security Response Protocol

If security issue found:
1. STOP immediately
2. Use **security-reviewer** agent
3. Fix CRITICAL issues before continuing
4. Rotate any exposed secrets immediately
5. Review entire codebase for similar issues
6. Check all log files for exposed secrets
7. Update .gitignore if needed
