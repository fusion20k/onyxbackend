-- Run this in Supabase SQL Editor

-- ============================================
-- CREATE STORAGE BUCKET FOR MESSAGE ATTACHMENTS
-- ============================================

-- Create bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-attachments', 'message-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STORAGE POLICIES
-- ============================================

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view attachments from their own conversations
CREATE POLICY "Users can view own conversation attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  (
    -- User's own uploads
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Attachments from their conversations
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = auth.uid()
      AND m.attachment_url LIKE '%' || name || '%'
    )
  )
);

-- Allow admins to view all attachments
CREATE POLICY "Admins can view all attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'message-attachments' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

-- Allow admins to upload attachments
CREATE POLICY "Admins can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

-- Service role has full access
CREATE POLICY "Service role can manage attachments"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'message-attachments');
