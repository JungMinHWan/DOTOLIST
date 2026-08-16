import { fetchPublicDataTrade } from '../re_service.mjs';
import { parseXmlItems } from '../re_parser.mjs';

const serviceKey = 'GY%2BV1BnKDmURgbv1z5mJB3QnX278JWkGMm9wOMP7ubR3B04uNiTRmYWC5cQBw5wHfOwgT32VRx9oFE4kgcF8qQ%3D%3D';

async function test() {
  console.log('Testing Public Data API for 노원구(11350), 202607...');
  try {
    const xml = await fetchPublicDataTrade('11350', '202607', serviceKey);
    console.log('XML fetched successfully. Length:', xml.length);
    const items = parseXmlItems(xml, '11350', '202607');
    console.log('Parsed items count:', items.length);
    if (items.length > 0) {
      console.log('Sample item:', JSON.stringify(items[0], null, 2));
    }
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
