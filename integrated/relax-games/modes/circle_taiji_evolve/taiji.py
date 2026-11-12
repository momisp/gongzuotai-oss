import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Circle, Wedge
from matplotlib.transforms import Affine2D

# ===================== 画布设置 =====================
fig, ax = plt.subplots(figsize=(6, 6), subplot_kw={'aspect': 'equal'})
ax.set_xlim(-250, 250)
ax.set_ylim(-250, 250)
ax.axis('off')

# ===================== 标准太极（与常见几何分解一致：左白右黑 + 两小半圆 + 鱼眼） =====================
def draw_taichi(angle=0):
    """
    外圆半径 R；S 形由上下两个半径 R/2 的半圆在竖直径上衔接而成；
    鱼眼在小半圆的圆心处，半径 R/6（直径约为大圆的 1/3，在常见 1/5～1/6 比例范围内）。
    """
    ax.clear()
    ax.set_xlim(-250, 250)
    ax.set_ylim(-250, 250)
    ax.axis('off')

    R = 200
    r_half = R / 2
    r_eye = R / 6

    tf = Affine2D().rotate_deg_around(0, 0, angle) + ax.transData

    # 第一步～第二步：左右两个大半圆 → 左白右黑
    ax.add_patch(
        Wedge((0, 0), R, 90, 270, facecolor='white', edgecolor='none', transform=tf)
    )
    ax.add_patch(
        Wedge((0, 0), R, -90, 90, facecolor='black', edgecolor='none', transform=tf)
    )

    # 第三步：两个小半圆 — 上白（圆心 (0, R/2)，朝右的半圆）；下黑（圆心 (0,-R/2)，朝左的半圆）
    ax.add_patch(
        Wedge((0, r_half), r_half, -90, 90, facecolor='white', edgecolor='none', transform=tf)
    )
    ax.add_patch(
        Wedge((0, -r_half), r_half, 90, 270, facecolor='black', edgecolor='none', transform=tf)
    )

    # 第四步：鱼眼 — 阳（上白）中之阴黑；阴（下黑）中之阳白
    ax.add_patch(
        Circle((0, r_half), r_eye, facecolor='black', edgecolor='none', transform=tf)
    )
    ax.add_patch(
        Circle(
            (0, -r_half),
            r_eye,
            facecolor='white',
            edgecolor='black',
            linewidth=1.2,
            transform=tf,
        )
    )

    # 外轮廓
    ax.add_patch(
        Circle((0, 0), R, facecolor='none', edgecolor='black', linewidth=2, transform=tf)
    )


def update(frame):
    draw_taichi(-frame)
    return ax.patches


plt.tight_layout()
ani = FuncAnimation(
    fig,
    update,
    frames=range(0, 360, 2),
    interval=50,
    repeat=True,
)
plt.show()
