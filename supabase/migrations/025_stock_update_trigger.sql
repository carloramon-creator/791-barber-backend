-- Trigger to update products stock_quantity based on product_movements
CREATE OR REPLACE FUNCTION update_product_stock_from_movement()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.type = 'entry') THEN
        UPDATE products
        SET stock_quantity = stock_quantity + NEW.quantity
        WHERE id = NEW.product_id;
    ELSIF (NEW.type = 'exit') THEN
        UPDATE products
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_product_stock ON product_movements;
CREATE TRIGGER tr_update_product_stock
AFTER INSERT ON product_movements
FOR EACH ROW
EXECUTE FUNCTION update_product_stock_from_movement();

-- RPC for explicit decrement if needed (e.g. from backend)
CREATE OR REPLACE FUNCTION decrement_product_stock(p_id UUID, p_quantity INTEGER)
RETURNS VOID AS $$
BEGIN
    UPDATE products
    SET stock_quantity = stock_quantity - p_quantity
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;
