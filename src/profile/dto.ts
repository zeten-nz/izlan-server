import { DESIGN_KEYS } from './cosmetic-registry';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const KIND = ['FRAME', 'BANNER', 'EFFECT', 'TITLE'];
const RARITY = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(160, { message: "Bio 160 belgidan oshmasin" })
  bio?: string;

  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() showFullName?: boolean;
  @IsOptional() @IsBoolean() showAchievements?: boolean;
  @IsOptional() @IsBoolean() showStats?: boolean;
}

export class UsernameParamDto {
  @Matches(/^[A-Za-z0-9_.]{3,32}$/, { message: "Foydalanuvchi nomi noto'g'ri" })
  username!: string;
}

export class CatalogQueryDto {
  @IsOptional() @IsIn(KIND, { message: "Tur noto'g'ri" }) kind?: string;
  @IsOptional() @IsIn(RARITY, { message: "Noyoblik noto'g'ri" }) rarity?: string;
}

export class EquipDto {
  @IsIn(KIND, { message: "Tur noto'g'ri" })
  kind!: string;

  /** null = bezakni yechish (standart holat) */
  @ValidateIf((o: EquipDto) => o.itemId !== null)
  @IsUUID('all', { message: "Bezak noto'g'ri" })
  itemId!: string | null;
}

export class CosmeticDto {
  @IsString() @MaxLength(60) @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "Slug noto'g'ri" }) slug!: string;
  @IsIn(KIND) kind!: string;
  @IsIn(RARITY) rarity!: string;
  @IsString() @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsInt({ message: "Narx butun son bo'lsin" }) @Min(1, { message: "Narx noldan katta bo'lsin" }) @Max(10_000_000) priceXp?: number | null;
  @IsOptional() @IsString() @MaxLength(60) season?: string | null;
  /** Faqat qisqa token: klient shu kalit bo'yicha o'z vizualini chizadi */
  @IsOptional() @IsIn(DESIGN_KEYS, { message: "Dizayn kaliti ruxsat etilmagan" }) previewKey?: string;
}

export class UpdateCosmeticDto {
  @IsOptional() @IsIn(RARITY) rarity?: string;
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsInt({ message: "Narx butun son bo'lsin" }) @Min(1, { message: "Narx noldan katta bo'lsin" }) @Max(10_000_000) priceXp?: number | null;
  @IsOptional() @IsString() @MaxLength(60) season?: string | null;
  @IsOptional() @IsIn(DESIGN_KEYS, { message: "Dizayn kaliti ruxsat etilmagan" }) previewKey?: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'DISABLED']) status?: string;
}
