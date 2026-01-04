-- Helper function to inspect table columns
CREATE OR REPLACE FUNCTION get_table_columns(table_name_input TEXT)
RETURNS TABLE (column_name TEXT, data_type TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.column_name::TEXT, c.data_type::TEXT
    FROM information_schema.columns c
    WHERE c.table_name = table_name_input
    AND c.table_schema = 'public';
END;
$$;
