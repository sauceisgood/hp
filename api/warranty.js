export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Use POST' });
    }

    const { serialNumber } = req.body;

    if (!serialNumber) {
        return res.status(400).json({ error: 'Número de série obrigatório' });
    }

    try {
        // Passo 1: Pesquisar produto
        const searchUrl = `https://support.hp.com/wcc-services/searchresult/pt-pt?q=${encodeURIComponent(serialNumber)}&context=pdp`;
        const searchRes = await fetch(searchUrl);
        
        if (!searchRes.ok) {
            return res.status(searchRes.status).json({ error: `Erro na pesquisa: ${searchRes.status}` });
        }

        const searchData = await searchRes.json();
        const productData = searchData?.data?.verifyResponse?.data;

        if (!productData) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        const sku = productData.altProductNumber || productData.productNumber || 'N/A';

        // Passo 2: Obter garantia
        const warrantyPayload = {
            cc: "pt",
            lc: "pt",
            utcOffset: "P0100",
            devices: [{
                countryOfPurchase: "pt",
                serialNumber: serialNumber,
                productNumber: sku,
                displayProductNumber: productData.productNumber || sku
            }],
            skipSyncCall: false
        };

        const warrantyUrl = 'https://support.hp.com/wcc-services/profile/devices/warranty/specs?authState=anonymous&template=WarrantyLanding';
        const warrantyRes = await fetch(warrantyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(warrantyPayload)
        });

        if (!warrantyRes.ok) {
            return res.status(warrantyRes.status).json({ error: `Erro na garantia: ${warrantyRes.status}` });
        }

        const warrantyData = await warrantyRes.json();
        const deviceInfo = warrantyData?.data?.devices?.[0];
        const warrantyInfo = deviceInfo?.warranty?.data;
        const productSpecs = deviceInfo?.productSpecs?.data;

        if (!warrantyInfo) {
            return res.status(404).json({ error: 'Garantia não encontrada' });
        }

        return res.status(200).json({
            success: true,
            data: {
                serialNumber: warrantyInfo.serialNumber || serialNumber,
                productNumber: warrantyInfo.productNumber || sku,
                productName: productSpecs?.productName || 'N/A',
                status: warrantyInfo.status || 'N/A',
                statusCode: warrantyInfo.statusCode || null,
                warrantyType: warrantyInfo.warrantyTypeDescription || 'N/A',
                warrantyStartDate: warrantyInfo.warrantyStartDate || null,
                warrantyEndDate: warrantyInfo.warrantyEndDate || null,
                caption: warrantyInfo.caption || null,
                statusDetail: warrantyInfo.statusDetail || null
            }
        });

    } catch (error) {
        return res.status(500).json({ 
            error: 'Erro interno',
            details: error.message 
        });
    }
}
