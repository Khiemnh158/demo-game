# Demo Game · Điện Sao 360°

Game đấu trường pixel chơi offline trong trình duyệt. Mở `index.html` để chơi hoặc triển khai tệp này lên máy chủ tĩnh.

## Chơi thử

- **Đấu trường** có bot, rồng boss, ngọc kinh nghiệm, kỹ năng và bảng xếp hạng theo trận.
- **Phòng tập** có bia theo tám hướng, cận cảnh và tốc độ chậm để kiểm tra động tác của 10 tướng.
- Dùng **WASD** hoặc phím mũi tên để di chuyển, chuột để ngắm và **Esc** để tạm dừng. Với cung, giữ chuột trái hoặc **Space** để kéo dây rồi thả để bắn. Trên màn hình cảm ứng, kéo bên trái để chạy và bên phải để ngắm.

## Sửa và dựng mã nguồn

- `outputs/ArrowIO_DienSao_Pixel.html` chứa mẫu HTML, giao diện và logic đấu trường gốc.
- `work/arrow_playable/` chứa điều khiển, cơ chế chiến đấu, giao diện phòng tập và atlas cơ sở.
- `work/arrow_360/` chứa chuyển động tám hướng, hiệu ứng theo vũ khí, atlas pixel và bộ kiểm tra.

Dùng Python 3 để tạo lại `index.html`. Dùng Node.js để chạy kiểm tra.

```sh
python build.py
node work/arrow_360/qa_360.cjs index.html
```

Quy trình dựng dùng các atlas PNG và dữ liệu tư thế đã đóng gói trong repo. Bản game cuối cùng nhúng toàn bộ ảnh, CSS và JavaScript trong một tệp HTML.
