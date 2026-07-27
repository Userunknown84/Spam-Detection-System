# 🤝 Contributing Guide

We welcome contributions to improve this project.

## Steps to Contribute:
1. Fork the repository  
2. Create a new branch (`feature-name`)  
3. Make your changes  
4. Commit changes  
5. Push to branch  
6. Open a Pull Request  
7. Don't add extra file , if anything else you try with api then delete .env before send a PR.

## Rules:
- Keep code clean and readable  
- Follow project structure  
- Describe changes clearly in PR  

## Running Tests

### Python ML API (`backend/`)
The Flask ML API has a pytest suite covering `/predict` input validation, edge cases, and explanation responses.

```bash
cd backend
pip install -r requirements.txt
pytest tests/
```

Some tests require environment variables to be set (a real `INTERNAL_SECRET` of at least 32 characters, and model file paths); see `backend/tests/test_predict_input_validation.py` for the variables a test file sets via `os.environ.setdefault`.

### Node/Express backend (`backend/`)
The Express layer (proxy routes, middleware, jobs) uses Jest + Supertest for most suites, plus a few `node:test` suites for modules that don't need Jest's mocking:

```bash
cd backend
npm install
npm test
```

This runs the Jest suite first, then the `node:test` suites (`keywordRules`, `rateLimiter`, `avatarUpload`, `fileValidation`) via `node --test`.

### Frontend (`frontend/`)
The React app uses Vitest + React Testing Library:

```bash
cd frontend
npm install
npm test
```

Before submitting a PR that touches `backend/` or `frontend/` code, please run the relevant test suite(s) above and make sure they pass.

# 📜 Code of Conduct

- Be respectful to all contributors  
- No abusive or toxic behavior  
- Focus on collaboration and improvement  
- Respect different opinions and ideas  