# Spec and build

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:

- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

Assess the task's difficulty, as underestimating it leads to poor outcomes.

- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:

- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `c:\Users\david\Desktop\onyxbackend\.zencoder\chats\01038110-18f0-4ca9-85f7-8d142a9cfc18/spec.md` with:

- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `c:\Users\david\Desktop\onyxbackend\.zencoder\chats\01038110-18f0-4ca9-85f7-8d142a9cfc18/spec.md`:

- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Save to `c:\Users\david\Desktop\onyxbackend\.zencoder\chats\01038110-18f0-4ca9-85f7-8d142a9cfc18/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [x] Step: Implementation

#### [x] Task 1: Project Setup & Initialization
- Initialize Node.js project (package.json)
- Install all dependencies
- Create directory structure (src/, src/routes/, src/middleware/, src/utils/)
- Set up .gitignore and .env template
- Create main index.js with basic Express setup
- **Verification**: `node src/index.js` runs without errors

#### [x] Task 2: Supabase Configuration
- Set up Supabase client utility (src/utils/supabase.js)
- Configure service key authentication
- **Verification**: Client initializes successfully

#### [x] Task 3: Database Schema Setup
- Create SQL migration file for all tables (applications, invite_tokens, users, workspaces)
- Add indexes for performance
- Configure Row Level Security policies
- **Verification**: Run SQL in Supabase dashboard, verify tables exist

#### [x] Task 4: Core Express Application
- Set up CORS middleware with frontend URL
- Add JSON body parser
- Create health check endpoint
- Configure error handling middleware
- **Verification**: `GET /health` returns 200 OK

#### [x] Task 5: Email Utility Module
- Create src/utils/email.js
- Implement Resend integration
- Add email templates for invites
- **Verification**: Test email sending (optional for MVP)

#### [x] Task 6: Invite Routes Implementation
- Create src/routes/invite.js
- Implement `GET /validate-token` endpoint
- Implement `POST /validate-email` endpoint
- **Verification**: Test both endpoints with sample data

#### [x] Task 7: Auth Routes Implementation
- Create src/routes/auth.js
- Implement `POST /create-account` endpoint with:
  - Token validation
  - Supabase Auth user creation
  - Users table record creation
  - Workspace creation
  - Token marking as used
  - Session creation
- Implement `POST /login` endpoint
- Implement `POST /logout` endpoint
- Implement `GET /me` endpoint
- **Verification**: Test complete registration flow

#### [x] Task 8: Authentication Middleware
- Create src/middleware/auth.js
- Implement JWT validation middleware
- Add user extraction from token
- **Verification**: Protected endpoints return 401 without token

#### [x] Task 9: Final Testing & Documentation
- Test all endpoints end-to-end
- Verify error handling for edge cases
- Create README.md with setup instructions
- Document all environment variables
- **Verification**: Complete user flow works (validate → register → login)

#### [ ] Task 10: Report Generation
After completion, write a report to `c:\Users\david\Desktop\onyxbackend\.zencoder\chats\01038110-18f0-4ca9-85f7-8d142a9cfc18/report.md` describing:
- What was implemented
- How the solution was tested
- The biggest issues or challenges encountered
