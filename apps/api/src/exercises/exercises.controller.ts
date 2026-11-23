import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import type { Response } from "express";
import { diskStorage } from "multer";
import { CurrentUser } from "../auth/current-user.js";
import { JwtAuthGuard, Roles, RolesGuard } from "../auth/guards.js";
import { Role, type JwtPrincipal } from "../common/domain.js";
import { CommitImportDto, ImportExerciseDto, ManualGradeDto, SaveAnswersDto, UpdateExerciseDraftDto } from "./exercises.dto.js";
import { ExercisesService } from "./exercises.service.js";

@Controller() @UseGuards(JwtAuthGuard, RolesGuard)
export class ExercisesController {
  constructor(private service: ExercisesService) {}
  @Get("assignments/:id/exercise/draft") @Roles(Role.TEACHER, Role.ADMIN) getDraft(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.getDraft(id, user); }
  @Post("assignments/:id/exercise/draft") @Roles(Role.TEACHER, Role.ADMIN) createDraft(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.getDraft(id, user); }
  @Put("assignments/:id/exercise/draft") @Roles(Role.TEACHER, Role.ADMIN) updateDraft(@Param("id") id: string, @Body() dto: UpdateExerciseDraftDto, @CurrentUser() user: JwtPrincipal) { return this.service.updateDraft(id, dto, user); }
  @Post("assignments/:id/exercise/validate") @Roles(Role.TEACHER, Role.ADMIN) validate(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.validate(id, user); }
  @Post("assignments/:id/exercise/publish") @Roles(Role.TEACHER, Role.ADMIN) publish(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.publish(id, user); }
  @Post("courses/:courseId/exercises/import/preview") @Roles(Role.TEACHER, Role.ADMIN) previewImport(@Body() dto: ImportExerciseDto) { return this.service.previewImport(dto.source); }
  @Post("courses/:courseId/exercises/import/commit") @Roles(Role.TEACHER, Role.ADMIN) commitImport(@Param("courseId") courseId: string, @Body() dto: CommitImportDto, @CurrentUser() user: JwtPrincipal) { return this.service.commitImport(courseId, dto, user); }
  @Get("assignments/:id/exercise") @Roles(Role.STUDENT) getPublished(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.getPublished(id, user); }
  @Post("assignments/:id/exercise/attempts") @Roles(Role.STUDENT) start(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.start(id, user); }
  @Get("exercise-attempts/:id") @Roles(Role.STUDENT) resume(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.resume(id, user); }
  @Patch("exercise-attempts/:id/answers") @Roles(Role.STUDENT) save(@Param("id") id: string, @Body() dto: SaveAnswersDto, @CurrentUser() user: JwtPrincipal) { return this.service.saveAnswers(id, dto, user); }
  @Post("exercise-attempts/:id/submit") @Roles(Role.STUDENT) submit(@Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @CurrentUser() user: JwtPrincipal) { return this.service.submit(id, key, user); }
  @Get("exercise-attempts/:id/result") @Roles(Role.STUDENT) result(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.result(id, user); }
  @Get("assignments/:id/exercise/attempts") @Roles(Role.TEACHER, Role.ADMIN) listAttempts(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.listAttempts(id, user); }
  @Get("exercise-attempts/:id/review") @Roles(Role.TEACHER, Role.ADMIN) review(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.review(id, user); }
  @Put("exercise-attempts/:id/grading") @Roles(Role.TEACHER, Role.ADMIN) manualGrade(@Param("id") id: string, @Body() dto: ManualGradeDto, @CurrentUser() user: JwtPrincipal) { return this.service.manualGrade(id, dto.manualPoints, user); }
  @Post("exercise-attempts/:id/feedback/publish") @Roles(Role.TEACHER, Role.ADMIN) publishResult(@Param("id") id: string, @CurrentUser() user: JwtPrincipal) { return this.service.publishResult(id, user); }
  @Post("courses/:courseId/exercise-assets") @Roles(Role.TEACHER, Role.ADMIN)
  @UseInterceptors(FileInterceptor("file", { storage: exerciseDiskStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  uploadAsset(@Param("courseId") courseId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPrincipal) { return this.service.uploadCourseAsset(courseId, file, user); }
  @Post("exercise-attempts/:id/audio") @Roles(Role.STUDENT)
  @UseInterceptors(FileInterceptor("file", { storage: exerciseDiskStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  uploadAudio(@Param("id") id: string, @Body("questionId") questionId: string, @Body("durationSeconds") duration: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPrincipal) { return this.service.uploadAudio(id, questionId, Number(duration), file, user); }
  @Get("exercise-assets/:id/content")
  async assetContent(@Param("id") id: string, @CurrentUser() user: JwtPrincipal, @Res() response: Response) { const { asset, opened } = await this.service.openAsset(id, user); response.setHeader("Content-Type", opened.mime); response.setHeader("Content-Length", String(asset.sizeBytes)); response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`); opened.stream.on("error", (error) => response.destroy(error)); opened.stream.pipe(response); }
}

function exerciseDiskStorage() {
  return diskStorage({ destination: (_request, _file, callback) => { const root = process.env.LOCAL_STORAGE_ROOT ?? "/tmp/uploads"; mkdirSync(root, { recursive: true }); callback(null, root); }, filename: (_request, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) });
}

