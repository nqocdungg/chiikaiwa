const assets = import.meta.glob('./assets/island/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** @param {string} name */
export function islandAsset(name) {
  return /** @type {string} */ (assets['./assets/island/' + name + '.webp']);
}

const artThemes = [
  {
    match: /cà phê|tiệm trà|đồ uống/u,
    building: 'cafe',
    mascot: 'cafe',
    scene: 'cafe',
  },
  {
    match: /đàm phán|thương thảo|quản trị|hợp đồng/u,
    building: 'office',
    mascot: 'work',
    scene: 'business',
  },
  {
    match: /du lịch|nhà ga|giao thông|sân bay|khách sạn/u,
    building: 'station',
    mascot: 'travel',
    scene: 'travel',
  },
  {
    match: /đại học|trường học|lớp học|học tập/u,
    building: 'school',
    mascot: 'reading',
    scene: 'study',
  },
  {
    match: /mua sắm|siêu thị|cửa hàng/u,
    building: 'shop',
    mascot: 'shopping',
    scene: 'market',
  },
  {
    match: /nhà hàng|ăn uống|gọi món|ẩm thực/u,
    building: 'restaurant',
    mascot: 'ramen',
    scene: 'market',
  },
  {
    match: /công sở|việc làm|văn phòng/u,
    building: 'office',
    mascot: 'work',
    scene: 'daily',
  },
  {
    match: /bưu điện|bưu phẩm|giao hàng|đời sống/u,
    building: 'post',
    mascot: 'reading',
    scene: 'daily',
  },
];

const fallback = { building: 'library', mascot: 'reading', scene: 'study' };

/** @param {Pick<import('./library-api.js').Topic, 'title' | 'description'>} topic */
export function topicArt({ title, description }) {
  const name = title.normalize('NFC').toLocaleLowerCase('vi');
  const details = description?.normalize('NFC').toLocaleLowerCase('vi') ?? '';
  const { building, mascot, scene } =
    artThemes.find(({ match }) => match.test(name)) ??
    artThemes.find(({ match }) => match.test(details)) ??
    fallback;

  const buildingAsset = islandAsset('building-' + building);

  return {
    building: buildingAsset,
    icon: building === 'cafe' ? islandAsset('icon-cafe') : buildingAsset,
    mascot: islandAsset('mascot-' + mascot),
    illustration: islandAsset('scene-' + scene),
    mascotKind: mascot,
  };
}
