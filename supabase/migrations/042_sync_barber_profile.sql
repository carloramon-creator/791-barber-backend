-- Trigger to sync user profile changes to barber profile
CREATE OR REPLACE FUNCTION sync_user_to_barber()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE barbers
    SET 
        name = COALESCE(NEW.name, name),
        nickname = COALESCE(NEW.nickname, nickname),
        photo_url = COALESCE(NEW.photo_url, photo_url)
    WHERE user_id = NEW.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_user_to_barber ON users;
CREATE TRIGGER tr_sync_user_to_barber
AFTER UPDATE OF name, nickname, photo_url ON users
FOR EACH ROW
EXECUTE FUNCTION sync_user_to_barber();
