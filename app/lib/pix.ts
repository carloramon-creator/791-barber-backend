export function crc16(buffer: string): string {
    let crc = 0xffff;
    const length = buffer.length;

    for (let i = 0; i < length; i++) {
        let char = buffer.charCodeAt(i);
        crc = ((crc >> 8) | (crc << 8)) & 0xffff;

        // char is 8 bits (ascii), but just in case, mask it.
        // Actually, JS charCodeAt returns UTF-16 code units.
        // For standard ASCII chars in PIX payload, it works fine.
        // Standard defines payload as ASCII visible characters.

        crc ^= (char & 0xff00) !== 0 ? 0 : char; // Simple XOR implementation logic varies, standard CCITT-False:

        // Let's use standard polynomial 0x1021 implementation for CCITT-False (used by Pix)
        // Re-implementing strictly:
    }

    // Better implementation verified against central bank samples
    let crc_val = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
        let c = buffer.charCodeAt(i);
        crc_val ^= c << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc_val & 0x8000) !== 0)
                crc_val = (crc_val << 1) ^ 0x1021;
            else
                crc_val = crc_val << 1;
        }
        crc_val &= 0xFFFF; // Keep only 16 bits
    }

    return crc_val.toString(16).toUpperCase().padStart(4, '0');
}

function formatField(id: string, value: string): string {
    const len = value.length.toString().padStart(2, '0');
    return `${id}${len}${value}`;
}

export function generatePixPayload(
    pixKey: string,
    merchantName: string, // max 25 chars
    merchantCity: string, // max 15 chars
    amount: number,
    txId: string = '***' // max 25 chars, *** means automatic
): string {
    // Basic normalization
    const name = merchantName.substring(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const city = merchantCity.substring(0, 15).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const formattedAmount = amount.toFixed(2);

    let payload =
        formatField('00', '01') + // Format Indicator (Version 01)
        formatField('26',
            formatField('00', 'BR.GOV.BCB.PIX') +
            formatField('01', pixKey || '') // Chave Pix
        ) +
        formatField('52', '0000') + // Merchant Category Code (General)
        formatField('53', '986') + // Transaction Currency (986 = BRL)
        formatField('54', formattedAmount) + // Transaction Amount
        formatField('58', 'BR') + // Country Code
        formatField('59', name || 'LOJA') + // Merchant Name
        formatField('60', city || 'CIDADE') + // Merchant City
        formatField('62',
            formatField('05', txId) // Transaction ID (Data Object)
        );

    // Append CRC field ID and Length '6304' so CRC consumes it
    payload += '6304';

    payload += crc16(payload);

    return payload;
}
