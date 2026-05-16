import os
import pikepdf


def encrypt_pdf(input_path: str, output_path: str, password: str) -> str:
    with pikepdf.open(input_path) as pdf:
        pdf.save(
            output_path,
            encryption=pikepdf.Encryption(
                owner=password,
                user=password,
                R=6,  # AES-256
            ),
        )
    return output_path
