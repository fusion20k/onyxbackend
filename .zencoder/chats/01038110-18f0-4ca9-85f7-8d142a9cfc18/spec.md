# Onyx Backend - Technical Specification

## Complexity Assessment: HARD

This is a complex, high-risk implementation involving:
- Complete backend architecture from scratch
- Multiple service integrations (Supabase Auth, PostgreSQL, Email)
- Authentication/authorization flows
- Database schema design with RLS policies
- Token management and validation
- Error handling and rollback scenarios

## Technical Context

### Stack
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Email**: Resend
- **Deployment**: Render

### Dependencies
```json
{
  "express": "^4.18.2",
  "@supabase/supabase-js": "^2.39.0",
  "dotenv": "^16.3.1",
  "cors": "^2.8.5",
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^5.1.1",
  "nanoid": "^3.3.7",
  "resend": "^3.0.0"
}
```

## Implementation Approach

### Phase 1: Project Initialization
1. Initialize Node.js project with proper structure
2. Install dependencies
3. Configure environment variables
4. Set up Supabase client utilities

### Phase 2: Database Schema
1. Create applications table (for invite applications)
2. Create invite_tokens table (for token-based invites)
3. Create users table (extends Supabase auth.users)
4. Create workspaces table (user workspaces)
5. Add indexes for performance
6. Configure Row Level Security (RLS) policies

### Phase 3: Core Backend
1. Main Express app setup with CORS and middleware
2. Health check endpoint
3. Supabase utility module
4. Email utility module

### Phase 4: API Endpoints
1. **Invite Routes** (`/api/invite`)
   - `GET /validate-token` - Validate invite token
   - `POST /validate-email` - Check if email is approved
   
2. **Auth Routes** (`/api/auth`)
   - `POST /create-account` - Create new user account
   - `POST /login` - User login
   - `POST /logout` - User logout
   - `GET /me` - Get current user info

### Phase 5: Middleware
1. Authentication middleware (JWT validation)
2. Error handling middleware
3. Request logging

## Source Code Structure

```
onyxbackend/
├── src/
│   ├── routes/
│   │   ├── invite.js      # Invite validation endpoints
│   │   └── auth.js        # Authentication endpoints
│   ├── middleware/
│   │   ├── auth.js        # JWT auth middleware
│   │   └── errorHandler.js
│   ├── utils/
│   │   ├── supabase.js    # Supabase client
│   │   └── email.js       # Email sending utility
│   └── index.js           # Main Express app
├── .env                   # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## Data Model Changes

### Database Tables

**applications**
- `id` (UUID, PK)
- `name` (TEXT)
- `email` (TEXT, UNIQUE)
- `role` (TEXT)
- `reason` (TEXT)
- `project` (TEXT, nullable)
- `status` (TEXT: pending/approved/rejected)
- `created_at` (TIMESTAMPTZ)

**invite_tokens**
- `id` (UUID, PK)
- `email` (TEXT)
- `token` (TEXT, UNIQUE)
- `expires_at` (TIMESTAMPTZ)
- `used` (BOOLEAN)
- `application_id` (UUID, FK → applications.id)
- `created_at` (TIMESTAMPTZ)

**users**
- `id` (UUID, PK, FK → auth.users.id)
- `email` (TEXT, UNIQUE)
- `display_name` (TEXT)
- `role` (TEXT: member/admin)
- `created_at` (TIMESTAMPTZ)

**workspaces**
- `id` (UUID, PK)
- `user_id` (UUID, FK → users.id)
- `name` (TEXT)
- `created_at` (TIMESTAMPTZ)

### RLS Policies
- Applications: Admin-only access
- Invite tokens: No direct access (API-managed)
- Users: Self-read only
- Workspaces: Self-read only

## API Interface

### Invite Endpoints

**GET /api/invite/validate-token?token=XYZ**
- Response: `{ email: string }` or error
- Validates token exists, not expired, not used

**POST /api/invite/validate-email**
- Body: `{ email: string }`
- Response: `{ approved: boolean }`
- Checks if email has approved application

### Auth Endpoints

**POST /api/auth/create-account**
- Body: `{ token?: string, email: string, password: string, displayName: string }`
- Response: `{ success: boolean, session: object, user: object }`
- Creates user in auth.users and users table, creates workspace

**POST /api/auth/login**
- Body: `{ email: string, password: string }`
- Response: `{ session: object, user: object }`

**POST /api/auth/logout**
- Headers: `Authorization: Bearer <token>`
- Response: `{ success: boolean }`

**GET /api/auth/me**
- Headers: `Authorization: Bearer <token>`
- Response: `{ user: object }`

## Environment Variables

```env
PORT=3000
NODE_ENV=production

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

JWT_SECRET=
FRONTEND_URL=

RESEND_API_KEY=
FROM_EMAIL=
```

## Verification Approach

### Testing Strategy
1. **Manual API Testing**: Use Postman/Thunder Client for endpoint testing
2. **Database Verification**: Check Supabase dashboard for data integrity
3. **Integration Testing**: Test full user registration flow
4. **Error Scenarios**: Test token expiration, invalid tokens, duplicate emails

### Verification Steps
1. Run `node src/index.js` - server starts successfully
2. Test health check: `GET /health`
3. Test invite token validation with valid/invalid tokens
4. Test email validation with approved/unapproved emails
5. Test account creation flow end-to-end
6. Verify user created in Supabase Auth
7. Verify user record in users table
8. Verify workspace created
9. Test login with created credentials
10. Test protected endpoints with auth middleware

### Success Criteria
- [ ] All API endpoints return expected responses
- [ ] Database tables created with proper constraints
- [ ] RLS policies prevent unauthorized access
- [ ] Token validation works correctly
- [ ] Account creation completes successfully
- [ ] Login/logout functionality works
- [ ] Email validation identifies approved users
- [ ] Workspaces auto-created for new users
- [ ] Server deploys successfully to Render
- [ ] CORS configured for frontend domain
