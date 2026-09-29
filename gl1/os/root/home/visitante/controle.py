# controle.py: o programa que roda o projetor desta cabine.
#
# O projetor chama estado(quadro) para cada quadro que projeta, e usa o que
# ela devolve: a velocidade (FPS), a cor da luz (TINT), o grão da película
# (GRAIN) e o tempo do obturador. Mude as constantes e o filme muda.
#
# (Quem escreveu isto foi o projecionista, às três da manhã.)

FPS = 24          # quadros por segundo; 24 é cinema, 12 é filme mudo
TINT = "ambar"    # "ambar", "prata" ou "sepia"
GRAIN = 0.035     # 0 é digital demais; 0.1 é película velha

ROLO = 24 * 30 * 4   # quadros por rolo: dois minutos a 24 fps
ARRANQUE = 48        # quadros que o motor leva para pegar velocidade

CORES = {
    "ambar": (1.04, 0.98, 0.9),
    "prata": (0.96, 0.99, 1.05),
    "sepia": (1.06, 0.95, 0.82),
}


def rolo_atual(quadro):
    return quadro // ROLO + 1


def velocidade(quadro):
    """De 0 a 1: o motor sai devagar a cada rolo novo e chega à velocidade de cruzeiro."""
    # No primeiro rolo o motor já sai aquecido.
    if rolo_atual(quadro) == 1:
        return 1.0
    passo = quadro % ROLO
    return min(1.0, passo / ARRANQUE)


def estado(quadro):
    v = velocidade(quadro)
    return {
        "fps": FPS,
        "cor": CORES[TINT],
        "grao": GRAIN,
        "rolo": rolo_atual(quadro),
        # o obturador fica aberto mais tempo quando o motor ainda está lento
        "obturador": 1 / (FPS * v),
    }


if __name__ == "__main__":
    for q in (0, 1, ROLO - 1, ROLO + 60):
        print(q, estado(q))
