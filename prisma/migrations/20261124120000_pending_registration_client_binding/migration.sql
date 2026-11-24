-- Ro'yxatdan o'tish so'rovini boshlagan brauzerga bog'lash (S-01: pending registration hijack)
ALTER TABLE "PendingRegistration" ADD COLUMN "clientHash" TEXT;
