// api/warranty.js - Versão ESM para Vercel
export default async function handler(req, res) {
    // Configurar CORS para desenvolvimento local
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Método não permitido. Use POST.' 
        });
    }

    const { serialNumber } = req.body;

    if (!serialNumber) {
        return res.status(400).json({ 
            error: 'Número de série é obrigatório.' 
        });
    }

    try {
        console.log(`🔍 A pesquisar produto: ${serialNumber}`);

        // --- Passo 1: Pesquisar o produto ---
        const searchUrl = `https://support.hp.com/wcc-services/searchresult/pt-pt?q=${encodeURIComponent(serialNumber)}&context=pdp`;
        const searchResponse = await fetch(searchUrl);
        
        if (!searchResponse.ok) {
            throw new Error(`Erro na pesquisa: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        const productData = searchData?.data?.verifyResponse?.data;

        if (!productData) {
            return res.status(404).json({ 
                error: 'Produto não encontrado. Verifica o número de série.' 
            });
        }

        // Extrair dados do produto
        const sku = productData.altProductNumber || productData.productNumber || 'N/A';
        const seriesOid = productData.productSeriesOid;
        const modelOid = productData.productNameOid;

        console.log(`✅ Produto encontrado: ${productData.productName || 'N/A'}`);

        // --- Passo 2: Obter detalhes da garantia ---
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
        const warrantyResponse = await fetch(warrantyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(warrantyPayload)
        });

        if (!warrantyResponse.ok) {
            throw new Error(`Erro na consulta de garantia: ${warrantyResponse.status}`);
        }

        const warrantyData = await warrantyResponse.json();

        // --- Passo 3: Extrair e formatar os dados ---
        const deviceInfo = warrantyData?.data?.devices?.[0];
        const warrantyInfo = deviceInfo?.warranty?.data;
        const productSpecs = deviceInfo?.productSpecs?.data;

        if (!warrantyInfo) {
            return res.status(404).json({ 
                error: 'Garantia não encontrada para este produto.' 
            });
        }

        console.log(`✅ Garantia encontrada: ${warrantyInfo.status || 'N/A'}`);

        // Dados formatados para retornar
        const result = {
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
                statusDetail: warrantyInfo.statusDetail || null,
                state: warrantyInfo.state || null,
                serviceType: warrantyInfo.serviceType || null
            }
        };

        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ Erro na API:', error);
        return res.status(500).json({ 
            error: 'Erro interno ao processar a consulta.',
            details: error.message 
        });
    }
}
