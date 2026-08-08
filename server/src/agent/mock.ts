type DemoProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: string;
};

export const demoProducts: DemoProduct[] = [
  {
    id: 1,
    name: '无线蓝牙耳机',
    price: 199,
    stock: 35,
    category: '数码',
  },
  {
    id: 2,
    name: '机械键盘',
    price: 299,
    stock: 18,
    category: '数码',
  },
  {
    id: 3,
    name: '纯棉短袖 T 恤',
    price: 89,
    stock: 50,
    category: '服装',
  },
  {
    id: 4,
    name: '保温水杯',
    price: 69,
    stock: 0,
    category: '生活',
  },
];
