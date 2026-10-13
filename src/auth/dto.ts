import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Matches, MaxLength, Max, Min, MinLength } from 'class-validator';

/** Parol siyosati: kamida 8 belgi, katta harf, kichik harf va raqam. Klient ham xuddi shu qoidani ishlatadi. */
export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
export const PASSWORD_MSG = "Parol kamida 8 ta belgi: katta harf, kichik harf va raqam bo'lishi shart";
export const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{2,23}$/;
/** Eng yoshi: platforma 11 yoshdan. */
export const MIN_AGE = 10;
export const MIN_BIRTH_YEAR = 1940;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

const NAME_RE = /^[\p{L}][\p{L}\p{M}' ʻʼ`’-]*$/u;
const NAME_MSG = "Faqat harflardan iborat bo'lsin";

class EmailField {
  @Transform(lower)
  @IsEmail({}, { message: "Email manzil noto'g'ri" })
  @MaxLength(254, { message: "Email juda uzun" })
  email!: string;
}

class OtpField extends EmailField {
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: "Kod 6 ta raqamdan iborat bo'lishi kerak" })
  code!: string;
}

export class RegisterDto extends EmailField {
  @Transform(trim)
  @IsString({ message: 'Ism kiritilmagan' })
  @MinLength(2, { message: "Ism kamida 2 ta harf bo'lsin" })
  @MaxLength(40, { message: 'Ism juda uzun' })
  @Matches(NAME_RE, { message: NAME_MSG })
  firstName!: string;

  @Transform(trim)
  @IsString({ message: 'Familya kiritilmagan' })
  @MinLength(2, { message: "Familya kamida 2 ta harf bo'lsin" })
  @MaxLength(40, { message: 'Familya juda uzun' })
  @Matches(NAME_RE, { message: NAME_MSG })
  lastName!: string;

  @Transform(lower)
  @Matches(USERNAME_RE, {
    message: "Username 3-24 belgi: kichik lotin harf, raqam, nuqta yoki pastki chiziq",
  })
  username!: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value))
  @IsInt({ message: "Tug'ilgan yilni kiriting" })
  @Min(MIN_BIRTH_YEAR, { message: "Tug'ilgan yil noto'g'ri" })
  @Max(new Date().getFullYear() - MIN_AGE, { message: "Platforma 11 yoshdan boshlab" })
  birthYear!: number;

  @IsString()
  @Matches(PASSWORD_RE, { message: PASSWORD_MSG })
  password!: string;

  @IsString({ message: 'Parolni qayta kiriting' })
  confirmPassword!: string;
}

export class VerifyRegistrationDto extends OtpField {}

export class ResendDto extends EmailField {}

export class LoginDto {
  /** username yoki email */
  @Transform(lower)
  @IsString({ message: 'Username yoki email kiriting' })
  @MinLength(3, { message: 'Username yoki email kiriting' })
  @MaxLength(254)
  identifier!: string;

  @IsString({ message: 'Parolni kiriting' })
  @MinLength(1, { message: 'Parolni kiriting' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class ForgotDto extends EmailField {}

export class ResetPasswordDto extends OtpField {
  @IsString()
  @Matches(PASSWORD_RE, { message: PASSWORD_MSG })
  password!: string;

  @IsString({ message: 'Parolni qayta kiriting' })
  confirmPassword!: string;
}
