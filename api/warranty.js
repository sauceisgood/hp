export default async function handler(req, res) {
    // Configuração CORS
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
        // --- PASSO 1: Exatamente como no HAR ---
        // GET https://support.hp.com/wcc-services/searchresult/pt-pt?q=39PKA1&context=pdp&navigation=false&authState=anonymous&template=WarrantyLanding
        const searchUrl = `https://support.hp.com/wcc-services/searchresult/pt-pt?q=${encodeURIComponent(serialNumber)}&context=pdp&navigation=false&authState=anonymous&template=WarrantyLanding`;
        
        console.log(`📡 Search: ${searchUrl}`);
        
        const searchRes = await fetch(searchUrl, {
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:154.0) Gecko/20100101 Firefox/154.0',
                'Referer': 'https://support.hp.com/pt-pt/check-warranty'
            }
        });
        
        if (!searchRes.ok) {
            console.error(`❌ Erro na pesquisa: ${searchRes.status}`);
            return res.status(searchRes.status).json({ 
                error: `Erro na pesquisa: ${searchRes.status}` 
            });
        }

        const searchData = await searchRes.json();
        console.log(`📦 Search response:`, JSON.stringify(searchData).substring(0, 300));

        // Extrair exatamente como no HAR
        const productData = searchData?.data?.verifyResponse?.data;

        if (!productData) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        // Extrair os mesmos campos que o HAR
        const sku = productData.altProductNumber || productData.productNumber || 'N/A';
        const productName = productData.productName || 'N/A';
        const seriesOid = productData.productSeriesOid;
        const modelOid = productData.productNameOid;
        const serial = productData.serialNumber || serialNumber;

        console.log(`✅ Produto: ${productName}, SKU: ${sku}, SeriesOID: ${seriesOid}`);

        // --- PASSO 2: Exatamente como no HAR ---
        // POST https://support.hp.com/wcc-services/profile/devices/warranty/specs?authState=anonymous&template=WarrantyLanding
        const warrantyUrl = 'https://support.hp.com/wcc-services/profile/devices/warranty/specs?authState=anonymous&template=WarrantyLanding';
        
        // Payload exatamente como no HAR
        const warrantyPayload = {
            cc: "pt",
            lc: "pt",
            utcOffset: "P0100",
            devices: [{
                countryOfPurchase: "pt",
                serialNumber: serial,
                productNumber: sku,
                displayProductNumber: productData.productNumber || sku
            }],
            skipSyncCall: false
        };

        console.log(`📡 Warranty payload:`, JSON.stringify(warrantyPayload));

        const warrantyRes = await fetch(warrantyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:154.0) Gecko/20100101 Firefox/154.0',
                'Referer': 'https://support.hp.com/pt-pt/check-warranty',
                'Origin': 'https://support.hp.com'
            },
            body: JSON.stringify(warrantyPayload)
        });

        if (!warrantyRes.ok) {
            console.error(`❌ Erro na garantia: ${warrantyRes.status}`);
            return res.status(warrantyRes.status).json({ 
                error: `Erro na garantia: ${warrantyRes.status}` 
            });
        }

        const warrantyData = await warrantyRes.json();
        console.log(`📦 Warranty response:`, JSON.stringify(warrantyData).substring(0, 500));

        // Extrair exatamente como no HAR
        const deviceInfo = warrantyData?.data?.devices?.[0];
        const warrantyInfo = deviceInfo?.warranty?.data;
        const productSpecs = deviceInfo?.productSpecs?.data;

        if (!warrantyInfo) {
            return res.status(404).json({ error: 'Garantia não encontrada' });
        }

        // --- RESPOSTA EXATAMENTE COMO NO HAR ---
        // Replicar a estrutura do HAR
        return res.status(200).json({
            code: 200,
            data: {
                devices: [{
                    productSpecs: {
                        code: 200,
                        data: {
                            altProductNumber: productSpecs?.altProductNumber || sku,
                            altSerialNumber: productSpecs?.altSerialNumber || serial,
                            description: productSpecs?.description || '',
                            productName: productSpecs?.productName || productName,
                            productNameOid: productSpecs?.productNameOid || modelOid,
                            productNumber: productSpecs?.productNumber || sku,
                            productNumberOid: productSpecs?.productNumberOid || null,
                            productSeriesOid: productSpecs?.productSeriesOid || seriesOid,
                            serialNumber: productSpecs?.serialNumber || serial,
                            warrantyDetailsLink: productSpecs?.warrantyDetailsLink || '',
                            pdpLink: productSpecs?.pdpLink || '',
                            productSeriesName: productSpecs?.productSeriesName || '',
                            imageUri: productSpecs?.imageUri || '',
                            contactLink: productSpecs?.contactLink || ''
                        },
                        message: "Success",
                        status: "OK",
                        timeElapsedInMS: 230
                    },
                    warranty: {
                        code: 200,
                        data: {
                            altProductNumber: warrantyInfo.altProductNumber || sku,
                            caption: warrantyInfo.caption || '',
                            countries: warrantyInfo.countries || 'US',
                            deliverables: warrantyInfo.deliverables || {},
                            entitlements: warrantyInfo.entitlements || [],
                            hardwareCarePackEndDate: warrantyInfo.hardwareCarePackEndDate || null,
                            icons: warrantyInfo.icons || {},
                            imgWarranty: warrantyInfo.imgWarranty || '',
                            msgCodes: warrantyInfo.msgCodes || '',
                            onSite: warrantyInfo.onSite || false,
                            origin: warrantyInfo.origin || 'warranty/v2',
                            productNumber: warrantyInfo.productNumber || sku,
                            serialNumber: warrantyInfo.serialNumber || serial,
                            serviceLevel: warrantyInfo.serviceLevel || {},
                            serviceType: warrantyInfo.serviceType || '',
                            state: warrantyInfo.state || '',
                            status: warrantyInfo.status || '',
                            statusCode: warrantyInfo.statusCode || 0,
                            statusDetail: warrantyInfo.statusDetail || '',
                            subscriptions: warrantyInfo.subscriptions || [],
                            supportCode: warrantyInfo.supportCode || '',
                            tooltip: warrantyInfo.tooltip || '',
                            warrantyEndDate: warrantyInfo.warrantyEndDate || null,
                            warrantyStartDate: warrantyInfo.warrantyStartDate || null,
                            warrantyType: warrantyInfo.warrantyType || '',
                            warrantyTypeDescription: warrantyInfo.warrantyTypeDescription || '',
                            wccFlags: warrantyInfo.wccFlags || {}
                        },
                        message: "Success",
                        status: "OK",
                        timeElapsedInMS: 737
                    }
                }],
                subscriptionIcons: warrantyData?.data?.subscriptionIcons || {}
            },
            message: "Success",
            status: "OK",
            timeElapsedInMS: 1010
        });

    } catch (error) {
        console.error('❌ Erro fatal:', error);
        return res.status(500).json({ 
            error: 'Erro interno no servidor',
            details: error.message 
        });
    }
}
