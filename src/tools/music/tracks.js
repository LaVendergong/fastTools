// 内置歌单：来自 cyberMusicProject 的后端种子数据
const base = import.meta.env.BASE_URL

export const BUILTIN_TRACKS = [
  {
    id: 'huaniao-fengyue',
    songName: '华鸟风月',
    singer: 'senya',
    album: 'Imagine',
    duration: 346,
    src: `${base}music/01-huaniao-fengyue.mp3`,
    cover: `${base}music/01.jpg`,
  },
  {
    id: 'lengsel',
    songName: 'Lengsel',
    singer: 'Rigel Theatre',
    album: 'Lengsel - Ghosts of Memories',
    duration: 302,
    src: `${base}music/02-lengsel.mp3`,
    cover: `${base}music/02.jpg`,
  },
  {
    id: 'riness',
    songName: 'Riness -Ghosts of Memories',
    singer: 'Rigel Theatre & Miwele',
    album: 'Lengsel - Ghosts of Memories',
    duration: 350,
    src: `${base}music/03-riness.mp3`,
    cover: `${base}music/03.jpg`,
  },
]
