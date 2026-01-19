# Onyx Backend API

Node.js/Express backend for the Onyx platform, integrated with Supabase for authentication and database management.

## Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Email**: Resend
- **Deployment**: Render

## Setup

### Prerequisites

- Node.js v18 or higher
- Supabase account and project
- Resend API key (for email functionality)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd onyxbackend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
PORT=3000
NODE_ENV=development

# Supabase credentials (from your Supabase dashboard)
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# JWT Secret (generate a random string)
JWT_SECRET=your_strong_random_secret

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# Email service (Resend)
RESEND_API_KEY=your_resend_api_key
FROM_EMAIL=noreply@onyx-project.com
```

### Database Setup

1. Go to your Supabase project's SQL Editor
2. Run the migration file: `migrations/001_initial_schema.sql`
3. Verify all tables are created:
   - `applications`
   - `invite_tokens`
   - `users`
   - `workspaces`

### Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000` (or the PORT specified in `.env`).

## API Endpoints

### Health Check

**GET** `/health`
- Returns server status

### Invite Routes

**GET** `/api/invite/validate-token?token=XYZ`
- Validates an invite token
- Returns: `{ email: string }` or error

**POST** `/api/invite/validate-email`
- Body: `{ email: string }`
- Checks if email has approved application
- Returns: `{ approved: boolean }`

### Auth Routes

**POST** `/api/auth/create-account`
- Body: `{ token?: string, email: string, password: string, displayName: string }`
- Creates a new user account
- Returns: `{ success: boolean, session: object, user: object }`

**POST** `/api/auth/login`
- Body: `{ email: string, password: string }`
- Authenticates user and returns session
- Returns: `{ success: boolean, session: object, user: object }`

**POST** `/api/auth/logout`
- Headers: `Authorization: Bearer <token>`
- Logs out user and invalidates session
- Returns: `{ success: boolean }`

**GET** `/api/auth/me`
- Headers: `Authorization: Bearer <token>`
- Returns current user information
- Returns: `{ user: object }`

## Project Structure

```
onyxbackend/
├── src/
│   ├── routes/
│   │   ├── invite.js       # Invite validation endpoints
│   │   └── auth.js         # Authentication endpoints
│   ├── middleware/
│   │   ├── auth.js         # JWT auth middleware
│   │   └── errorHandler.js # Error handling middleware
│   ├── utils/
│   │   ├── supabase.js     # Supabase client
│   │   └── email.js        # Email utility (Resend)
│   └── index.js            # Main Express app
├── migrations/
│   └── 001_initial_schema.sql  # Database schema
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Database Schema

### applications
- Application submissions for platform access
- Fields: id, name, email, role, reason, project, status, created_at

### invite_tokens
- Invite tokens for approved users
- Fields: id, email, token, expires_at, used, application_id, created_at

### users
- User accounts (extends Supabase auth.users)
- Fields: id, email, display_name, role, created_at

### workspaces
- User workspaces
- Fields: id, user_id, name, created_at

## Deployment

### Deploying to Render

1. Create a new Web Service on Render
2. Connect your Git repository
3. Configure build settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add environment variables from `.env`
5. Deploy

## Security

- Row Level Security (RLS) enabled on all tables
- Service role key used for backend operations
- JWT-based authentication
- Password hashing via Supabase Auth
- CORS configured for frontend domain

## Development

- Use `npm run dev` for auto-reload during development
- Check logs for errors and debugging information
- Test endpoints with Postman, Thunder Client, or curl

## License

MIT
